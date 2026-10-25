import { expect, test } from '@playwright/test';
import type { ListVerification, VerificationJob } from '../src/app/models';
import { ADMIN, ApiMock, makeList, type MockContact, OPERATOR, seedSession } from './fixtures/api-mock';

const CLIENTES = makeList({ name: 'Clientes', contactCount: 3 });

const CONTATOS: MockContact[] = [
  {
    _id: 'ct-1',
    email: 'ana@empresa.com',
    name: 'Ana',
    verification: { status: 'deliverable', result: 'ok', checkedAt: '2026-10-01T12:00:00.000Z' },
  },
  {
    _id: 'ct-2',
    email: 'sumiu@empresa.com',
    name: 'Bruno',
    verification: { status: 'undeliverable', result: 'email_disabled', checkedAt: '2026-10-01T12:00:00.000Z' },
  },
  { _id: 'ct-3', email: 'novo@empresa.com', name: 'Cris' },
];

function job(over: Partial<VerificationJob>): VerificationJob {
  return {
    _id: 'vj-1',
    listId: CLIENTES._id,
    status: 'queued',
    total: 3,
    progress: 0,
    counters: { deliverable: 0, undeliverable: 0, risky: 0, unknown: 0 },
    error: '',
    startedAt: '2026-10-15T12:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-10-15T12:00:00.000Z',
    ...over,
  };
}

function estado(over: Partial<ListVerification>): ListVerification {
  return { enabled: true, quota: { limit: 10000, used: 120 }, pending: 3, ttlDays: 90, job: null, ...over };
}

async function abrirLista(page: import('@playwright/test').Page, verificacoes: ListVerification[], user = ADMIN) {
  const api = new ApiMock({ user, lists: [CLIENTES], contacts: CONTATOS, listVerifications: verificacoes });
  await api.install(page);
  await seedSession(page, user);
  await page.goto(`/lists/${CLIENTES._id}`);
  return api;
}

const painel = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Verificação de emails' });

test.describe('Verificação de emails da lista', () => {
  test('sem a chave da EmailListVerify o painel não aparece', async ({ page }) => {
    await abrirLista(page, [estado({ enabled: false })]);

    await expect(page.getByRole('row', { name: /ana@empresa.com/ })).toBeVisible();
    await expect(painel(page)).toHaveCount(0);
  });

  test('mostra o custo antes de verificar e acompanha até o resultado', async ({ page }) => {
    const api = await abrirLista(page, [
      estado({}),
      estado({ job: job({ status: 'verifying', progress: 40 }) }),
      estado({
        pending: 0,
        quota: { limit: 10000, used: 123 },
        job: job({
          status: 'done',
          progress: 100,
          finishedAt: '2026-10-15T12:05:00.000Z',
          counters: { deliverable: 1, undeliverable: 1, risky: 1, unknown: 0 },
        }),
      }),
    ]);

    await expect(painel(page)).toContainText('3 contato(s) ativo(s) sem verificação nos últimos 90 dias');
    await expect(painel(page)).toContainText('Cota do mês: 120 de 10.000');

    await painel(page).getByRole('button', { name: /Verificar 3 email/ }).click();
    const dialogo = page.getByRole('dialog', { name: 'Verificar emails da lista' });
    await expect(dialogo).toContainText('Cada verificação consome 1 crédito');
    await dialogo.getByRole('button', { name: 'Verificar 3' }).click();

    expect(api.lastCallTo('/verify')?.method).toBe('POST');
    await expect(painel(page)).toContainText('Na fila para verificar');
    await expect(painel(page).getByRole('progressbar')).toBeVisible();

    await expect(painel(page)).toContainText('Verificando as caixas postais', { timeout: 12_000 });
    await expect(painel(page)).toContainText('40%');

    await expect(page.getByText(/1 contato\(s\) reprovado\(s\) deixam de receber campanhas/)).toBeVisible({
      timeout: 12_000,
    });
    await expect(painel(page).getByRole('button', { name: /1 reprovados/ })).toBeVisible();
    await expect(painel(page).getByRole('progressbar')).toHaveCount(0);
  });

  test('cancelar a confirmação não gasta nada', async ({ page }) => {
    const api = await abrirLista(page, [estado({})]);

    await painel(page).getByRole('button', { name: /Verificar 3 email/ }).click();
    await page.getByRole('dialog', { name: 'Verificar emails da lista' }).getByRole('button', { name: 'Cancelar' }).click();

    expect(api.callsTo('/verify').filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  test('a tabela mostra a verificação e o resumo filtra os reprovados', async ({ page }) => {
    const api = await abrirLista(page, [
      estado({
        job: job({
          status: 'done',
          finishedAt: '2026-10-15T12:05:00.000Z',
          counters: { deliverable: 1, undeliverable: 1, risky: 0, unknown: 0 },
        }),
      }),
    ]);

    await expect(page.getByRole('row', { name: /ana@empresa.com/ })).toContainText('Válido');
    await expect(page.getByRole('row', { name: /sumiu@empresa.com/ })).toContainText('Reprovado');
    await expect(page.getByRole('row', { name: /novo@empresa.com/ })).toContainText('—');

    await painel(page).getByRole('button', { name: /1 reprovados/ }).click();
    await expect.poll(() => api.lastCallTo('/contacts')?.query['verification']).toBe('undeliverable');
    await expect(page.getByLabel('Filtrar por verificação')).toHaveValue('undeliverable');

    await page.getByLabel('Filtrar por verificação').selectOption('unverified');
    await expect.poll(() => api.lastCallTo('/contacts')?.query['verification']).toBe('unverified');
  });

  test('falha da última verificação aparece com o motivo', async ({ page }) => {
    await abrirLista(page, [estado({ job: job({ status: 'failed', error: 'Sem créditos na EmailListVerify.' }) })]);

    await expect(painel(page).getByRole('alert')).toContainText('Sem créditos na EmailListVerify.');
    await expect(painel(page).getByRole('button', { name: /Verificar 3 email/ })).toBeEnabled();
  });

  test('cota do mês insuficiente desabilita o botão e explica', async ({ page }) => {
    await abrirLista(page, [estado({ quota: { limit: 100, used: 99 } })]);

    const botao = painel(page).getByRole('button', { name: /Verificar 3 email/ });
    await expect(botao).toBeDisabled();
    await expect(painel(page)).toContainText('restam 1 verificações e a lista precisa de 3');
  });

  test('operador acompanha, mas não gasta créditos', async ({ page }) => {
    await abrirLista(page, [estado({})], OPERATOR);

    await expect(painel(page)).toContainText('3 contato(s) ativo(s)');
    await expect(painel(page).getByRole('button', { name: /Verificar/ })).toHaveCount(0);
  });

  test('erro ao iniciar mostra a mensagem do servidor e mantém o botão', async ({ page }) => {
    const api = await abrirLista(page, [estado({})]);
    api.fail('verifyList', 409, { error: 'Esta lista já está sendo verificada.' });

    await painel(page).getByRole('button', { name: /Verificar 3 email/ }).click();
    await page.getByRole('dialog', { name: 'Verificar emails da lista' }).getByRole('button', { name: 'Verificar 3' }).click();

    await expect(page.getByText('Esta lista já está sendo verificada.')).toBeVisible();
    await expect(painel(page).getByRole('button', { name: /Verificar 3 email/ })).toBeVisible();
  });
});
