import { expect, test } from '@playwright/test';
import { ADMIN, ApiMock, makeList, seedSession } from './fixtures/api-mock';

const CLIENTES = makeList({ name: 'Clientes', contactCount: 2, description: 'Quem já comprou' });
const LEADS = makeList({ name: 'Leads', contactCount: 0 });
const CONTATOS = [
  { _id: 'ct-1', email: 'ana@empresa.com', name: 'Ana' },
  { _id: 'ct-2', email: 'bruno@empresa.com', name: 'Bruno' },
];

async function abrirListas(page: import('@playwright/test').Page) {
  const api = new ApiMock({ user: ADMIN, lists: [CLIENTES, LEADS], contacts: CONTATOS });
  await api.install(page);
  await seedSession(page, ADMIN);
  await page.goto('/lists');
  return api;
}

test.describe('Listas', () => {
  test('a tabela não tem mais botões: a linha leva para a página da lista', async ({ page }) => {
    await abrirListas(page);

    const linha = page.getByRole('row', { name: /Clientes/ });
    await expect(linha.getByRole('button')).toHaveCount(0);

    await linha.getByText('Quem já comprou').click();

    await expect(page).toHaveURL(/\/lists\/l-clientes$/);
  });

  test('a página da lista mostra as ações no topo e os contatos dela', async ({ page }) => {
    const api = await abrirListas(page);

    await page.getByRole('link', { name: 'Clientes' }).click();

    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await expect(page.getByText('2 contatos')).toBeVisible();
    for (const acao of ['editar', 'exportar', 'excluir']) {
      await expect(page.getByRole('button', { name: acao })).toBeVisible();
    }
    await expect(page.getByRole('row', { name: /ana@empresa.com/ })).toBeVisible();
    expect(api.lastCallTo('/contacts')?.query).toMatchObject({ listId: 'l-clientes', page: '1' });
  });

  test('a busca filtra só dentro da lista', async ({ page }) => {
    const api = await abrirListas(page);
    await page.goto('/lists/l-clientes');

    await page.getByLabel('Buscar contato nesta lista').fill('ana');

    await expect.poll(() => api.lastCallTo('/contacts')?.query['search']).toBe('ana');
    expect(api.lastCallTo('/contacts')?.query['listId']).toBe('l-clientes');
  });

  test('editar atualiza o título sem sair da página', async ({ page }) => {
    const api = await abrirListas(page);
    await page.goto('/lists/l-clientes');

    await page.getByRole('button', { name: 'editar' }).click();
    const modal = page.getByRole('dialog', { name: 'Editar lista' });
    await modal.locator('#ld-name').fill('Clientes VIP');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(page.getByRole('heading', { name: 'Clientes VIP' })).toBeVisible();
    expect(api.lastCallTo('/lists/save')?.body).toMatchObject({ id: 'l-clientes', name: 'Clientes VIP' });
  });

  test('lista vazia não deixa exportar', async ({ page }) => {
    await abrirListas(page);
    await page.goto('/lists/l-leads');

    await expect(page.getByRole('button', { name: 'exportar' })).toBeDisabled();
  });

  test('excluir pede confirmação e volta para as listas', async ({ page }) => {
    const api = await abrirListas(page);
    await page.goto('/lists/l-clientes');

    await page.getByRole('button', { name: 'excluir' }).click();
    const modal = page.getByRole('dialog', { name: 'Excluir lista' });
    await expect(modal).toContainText('Os contatos não serão apagados');
    await modal.getByRole('button', { name: 'Excluir lista' }).click();

    await expect(page).toHaveURL(/\/lists$/);
    expect(api.callsTo('/lists/l-clientes').some((c) => c.method === 'DELETE')).toBe(true);
    await expect(page.getByRole('row', { name: /Clientes/ })).toHaveCount(0);
  });

  test('endereço de lista inexistente mostra o erro e o caminho de volta', async ({ page }) => {
    await abrirListas(page);
    await page.goto('/lists/nao-existe');

    await expect(page.getByText('Esta lista não existe ou foi excluída.')).toBeVisible();
    await page.getByRole('link', { name: '← Listas' }).click();
    await expect(page).toHaveURL(/\/lists$/);
  });
});
