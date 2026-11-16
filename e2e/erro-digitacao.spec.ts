import { expect, type Page, test } from '@playwright/test';
import type { TypoDomain } from '../src/app/models';
import { ADMIN, ApiMock, type MockContact, OPERATOR, seedSession } from './fixtures/api-mock';

const SUSPEITOS: TypoDomain[] = [
  { domain: 'iclou.com', count: 80, suggestion: 'icloud.com' },
  { domain: 'gail.com', count: 60, suggestion: 'gmail.com' },
  { domain: 'cloud.com', count: 3, suggestion: 'icloud.com' },
];

const MARCADO: MockContact = {
  _id: 'ct-1',
  email: 'ana@gail.com',
  name: 'Ana',
  verification: {
    status: 'undeliverable',
    result: 'typo_suspected',
    suggestion: 'gmail.com',
    checkedAt: '2026-11-10T12:00:00.000Z',
  },
};

async function abrirContatos(page: Page, api: ApiMock, user = ADMIN) {
  await api.install(page);
  await seedSession(page, user);
  await page.goto('/contacts');
}

const revisao = (page: Page) => page.getByRole('dialog', { name: 'Domínios com possível erro de digitação' });
const confirmacao = (page: Page, nome: string) => page.getByRole('dialog', { name: nome });

test.describe('Erro de digitação no domínio', () => {
  test('o admin vê o aviso com o total de domínios e contatos, e o contato marcado mostra a sugestão', async ({ page }) => {
    const api = new ApiMock({ typoDomains: SUSPEITOS, contacts: [MARCADO] });
    await abrirContatos(page, api);

    const aviso = page.getByRole('status').filter({ hasText: 'possível erro de digitação' });
    await expect(aviso).toContainText('3 domínios');
    await expect(aviso).toContainText('143 contatos');
    await expect(page.getByRole('row', { name: /ana@gail\.com/ })).toContainText('Erro de digitação? → @gmail.com');
  });

  test('sem domínios suspeitos não há aviso, e o usuário comum nem consulta a revisão', async ({ page }) => {
    const api = new ApiMock({ user: OPERATOR, typoDomains: SUSPEITOS, contacts: [MARCADO] });
    await abrirContatos(page, api, OPERATOR);

    await expect(page.getByRole('row', { name: /ana@gail\.com/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revisar domínios' })).toHaveCount(0);
    expect(api.callsTo('/contacts/typo-domains')).toHaveLength(0);
  });

  test('corrigir um domínio envia o destino editado e tira a linha da revisão', async ({ page }) => {
    const api = new ApiMock({ typoDomains: SUSPEITOS });
    await abrirContatos(page, api);
    await page.getByRole('button', { name: 'Revisar domínios' }).click();

    const modal = revisao(page);
    const linha = modal.getByRole('row', { name: /@gail\.com/ });
    await expect(linha.getByRole('textbox')).toHaveValue('gmail.com');

    await linha.getByRole('button', { name: 'Corrigir' }).click();
    await expect(confirmacao(page, 'Corrigir domínio')).toContainText('Trocar @gail.com por @gmail.com em 60 contato(s)?');
    await confirmacao(page, 'Corrigir domínio').getByRole('button', { name: 'Corrigir 60' }).click();

    await expect(page.getByText('60 contato(s) corrigido(s) para @gmail.com.')).toBeVisible();
    await expect(modal.getByRole('row', { name: /@gail\.com/ })).toHaveCount(0);
    expect(api.lastCallTo('/typo-domains/fix')?.body).toEqual({ from: 'gail.com', to: 'gmail.com' });
  });

  test('destino inválido bloqueia a correção com erro no campo', async ({ page }) => {
    const api = new ApiMock({ typoDomains: SUSPEITOS });
    await abrirContatos(page, api);
    await page.getByRole('button', { name: 'Revisar domínios' }).click();

    const linha = revisao(page).getByRole('row', { name: /@iclou\.com/ });
    await linha.getByRole('textbox').fill('icloud');
    await expect(linha).toContainText('Domínio inválido.');
    await expect(linha.getByRole('button', { name: 'Corrigir' })).toBeDisabled();

    await linha.getByRole('textbox').fill('iclou.com');
    await expect(linha).toContainText('É o mesmo domínio.');
  });

  test('conflitos ficam na revisão com a contagem que sobrou', async ({ page }) => {
    const api = new ApiMock({ typoDomains: SUSPEITOS, typoConflicts: { 'iclou.com': 2 } });
    await abrirContatos(page, api);
    await page.getByRole('button', { name: 'Revisar domínios' }).click();

    const linha = revisao(page).getByRole('row', { name: /@iclou\.com/ });
    await linha.getByRole('button', { name: 'Corrigir' }).click();
    await confirmacao(page, 'Corrigir domínio').getByRole('button', { name: 'Corrigir 80' }).click();

    await expect(page.getByText('78 contato(s) corrigido(s). 2 já existiam')).toBeVisible();
    await expect(linha.getByRole('cell').nth(1)).toHaveText(/^\s*2 contatos$/);
  });

  test('manter um domínio real o tira da revisão', async ({ page }) => {
    const api = new ApiMock({ typoDomains: SUSPEITOS });
    await abrirContatos(page, api);
    await page.getByRole('button', { name: 'Revisar domínios' }).click();

    await revisao(page).getByRole('row', { name: /@cloud\.com/ }).getByRole('button', { name: 'Manter' }).click();
    await confirmacao(page, 'Manter domínio').getByRole('button', { name: 'Manter' }).click();

    await expect(page.getByText('@cloud.com mantido.')).toBeVisible();
    await expect(revisao(page).getByRole('row', { name: /@cloud\.com/ })).toHaveCount(0);
    expect(api.lastCallTo('/typo-domains/accept')?.body).toEqual({ domain: 'cloud.com' });
  });

  test('erro ao carregar a revisão oferece tentar de novo', async ({ page }) => {
    const api = new ApiMock({ typoDomains: SUSPEITOS });
    await abrirContatos(page, api);
    await page.getByRole('button', { name: 'Revisar domínios' }).click();
    await expect(revisao(page).getByRole('row', { name: /@gail\.com/ })).toBeVisible();

    await revisao(page).getByRole('button', { name: 'Fechar' }).last().click();
    api.fail('typoDomains', 500, { error: 'Erro interno.' });
    await page.getByRole('button', { name: 'Revisar domínios' }).click();
    await expect(revisao(page).getByRole('button', { name: /tentar/i })).toBeVisible();

    api.failures.delete('typoDomains');
    await revisao(page).getByRole('button', { name: /tentar/i }).click();
    await expect(revisao(page).getByRole('row', { name: /@gail\.com/ })).toBeVisible();
  });

  test.describe('formulário de contato', () => {
    test('sugere o domínio certo e usa a sugestão com um clique', async ({ page }) => {
      const api = new ApiMock({ emailSuggestions: { 'joao@gmaail.com': 'joao@gmail.com' } });
      await abrirContatos(page, api);
      await page.getByRole('button', { name: '+ Novo contato' }).click();

      const modal = page.getByRole('dialog', { name: 'Novo contato' });
      await modal.getByLabel('Email *').fill('joao@gmaail.com');
      await expect(modal.getByText('Você quis dizer joao@gmail.com?')).toBeVisible();

      await modal.getByRole('button', { name: 'Usar este' }).click();
      await expect(modal.getByLabel('Email *')).toHaveValue('joao@gmail.com');
      await expect(modal.getByText('Você quis dizer')).toHaveCount(0);

      await modal.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByText('Contato salvo.')).toBeVisible();
      expect(api.lastCallTo('/contacts/save')?.body).toMatchObject({ email: 'joao@gmail.com' });
      expect(api.lastCallTo('/contacts/save')?.body).not.toHaveProperty('keepEmail');
    });

    test('manter como digitou envia keepEmail', async ({ page }) => {
      const api = new ApiMock({ emailSuggestions: { 'bia@cloud.com': 'bia@icloud.com' } });
      await abrirContatos(page, api);
      await page.getByRole('button', { name: '+ Novo contato' }).click();

      const modal = page.getByRole('dialog', { name: 'Novo contato' });
      await modal.getByLabel('Email *').fill('bia@cloud.com');
      await modal.getByRole('button', { name: 'Manter como digitei' }).click();
      await expect(modal.getByText('Mantido como digitado.')).toBeVisible();

      await modal.getByRole('button', { name: 'Salvar' }).click();
      await expect(page.getByText('Contato salvo.')).toBeVisible();
      expect(api.lastCallTo('/contacts/save')?.body).toMatchObject({ email: 'bia@cloud.com', keepEmail: true });
    });

    test('salvar ignorando a sugestão avisa que o contato fica fora das campanhas', async ({ page }) => {
      const api = new ApiMock({ emailSuggestions: { 'ana@gail.com': 'ana@gmail.com' } });
      await abrirContatos(page, api);
      await page.getByRole('button', { name: '+ Novo contato' }).click();

      const modal = page.getByRole('dialog', { name: 'Novo contato' });
      await modal.getByLabel('Email *').fill('ana@gail.com');
      await expect(modal.getByText('Você quis dizer ana@gmail.com?')).toBeVisible();
      await modal.getByRole('button', { name: 'Salvar' }).click();

      await expect(page.getByText(/fica fora das campanhas até a revisão/)).toBeVisible();
    });
  });
});
