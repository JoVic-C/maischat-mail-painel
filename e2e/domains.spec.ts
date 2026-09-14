import { expect, test } from '@playwright/test';
import type { SendingDomain } from '../src/app/models';
import { ADMIN, ApiMock, OPERATOR, seedSession } from './fixtures/api-mock';

const REGISTROS: SendingDomain['records'] = [
  {
    check: 'spf',
    type: 'TXT',
    host: 'cliente.com.br',
    value: 'v=spf1 include:maismail.com.br ~all',
    note: 'Se o domínio já tem SPF, acrescente include:maismail.com.br ao registro existente.',
  },
  {
    check: 'dkim',
    type: 'CNAME',
    host: 'mmail._domainkey.cliente.com.br',
    value: 'mmail._domainkey.maismail.com.br',
    note: 'Não conflita com a chave do Google.',
  },
  { check: 'dmarc', type: 'TXT', host: '_dmarc.cliente.com.br', value: 'v=DMARC1; p=none', note: '' },
];

const PENDENTE: SendingDomain = {
  domain: 'cliente.com.br',
  smtpNames: ['Marketing'],
  status: 'unverified',
  checks: {
    spf: { state: 'fail', detail: 'O SPF não autoriza o servidor de envio: falta include:maismail.com.br.' },
    dkim: { state: 'pass', detail: 'Chave DKIM publicada.' },
    dmarc: { state: 'pass', detail: 'DMARC publicado, com política none.' },
  },
  checkedAt: '2026-09-13T12:00:00.000Z',
  verifiedAt: null,
  records: REGISTROS,
};

const LIBERADO: SendingDomain = {
  ...PENDENTE,
  status: 'verified',
  checks: { ...PENDENTE.checks!, spf: { state: 'pass', detail: 'O SPF autoriza o servidor de envio.' } },
  verifiedAt: '2026-09-14T12:00:00.000Z',
};

function mockCom(domains: SendingDomain[], extra: ConstructorParameters<typeof ApiMock>[0] = {}): ApiMock {
  return new ApiMock({
    user: ADMIN,
    sendingDomains: { enforced: true, platformHosts: ['mail.maismail.com.br'], domains },
    ...extra,
  });
}

test.describe('Domínios de envio', () => {
  test('o menu de ajustes leva à tela de domínios', async ({ page }) => {
    const api = mockCom([PENDENTE]);
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'ajustes' }).click();
    await page.getByRole('menu').getByRole('link', { name: 'Domínios' }).click();

    await expect(page).toHaveURL(/\/dominios$/);
    await expect(page.getByRole('heading', { name: 'Domínios de envio' })).toBeVisible();
  });

  test('domínio pendente mostra o que falta e os registros a criar', async ({ page }) => {
    const api = mockCom([PENDENTE]);
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dominios');

    const card = page.locator('[data-domain="cliente.com.br"]');
    await expect(card.getByText('pendente', { exact: true })).toBeVisible();
    await expect(card.locator('[data-check="spf"]')).toContainText('falta include:maismail.com.br');
    await expect(card.locator('[data-check="dkim"]')).toContainText('mmail._domainkey.maismail.com.br');
    await expect(card.locator('[data-check="dkim"]')).toContainText('CNAME');
  });

  test('verificar atualiza o domínio sem recarregar a tela', async ({ page }) => {
    const api = mockCom([PENDENTE], { verifiedDomains: { 'cliente.com.br': LIBERADO } });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dominios');
    await page.getByRole('button', { name: 'Verificar agora' }).click();

    const card = page.locator('[data-domain="cliente.com.br"]');
    await expect(card.getByText('liberado', { exact: true })).toBeVisible();
    await expect(page.getByText('Domínio liberado para envio.')).toBeVisible();
    expect(api.callsTo('/sending-domains/cliente.com.br/verify')).toHaveLength(1);
    expect(api.callsTo('/sending-domains').filter((c) => c.method === 'GET')).toHaveLength(1);
  });

  test('sem servidor da plataforma cadastrado, orienta a cadastrar o SMTP', async ({ page }) => {
    const api = mockCom([]);
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dominios');

    await expect(page.getByText(/Cadastre um em Ajustes › SMTP/)).toBeVisible();
  });

  test('falha ao carregar oferece tentar de novo', async ({ page }) => {
    const api = mockCom([PENDENTE]);
    api.fail('sendingDomains', 500, { error: 'Erro interno.' });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dominios');
    await expect(page.getByText('Erro interno.')).toBeVisible();

    api.failures.delete('sendingDomains');
    await page.getByRole('button', { name: /tentar/i }).click();
    await expect(page.locator('[data-domain="cliente.com.br"]')).toBeVisible();
  });

  test('usuário comum não chega na tela', async ({ page }) => {
    const api = mockCom([PENDENTE], { user: OPERATOR });
    await api.install(page);
    await seedSession(page, OPERATOR);

    await page.goto('/dominios');

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(api.callsTo('/sending-domains')).toHaveLength(0);
  });
});
