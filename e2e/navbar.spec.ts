import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN, ApiMock, SUPERADMIN, seedSession } from './fixtures/api-mock';

/**
 * Barra de navegação.
 *
 * O risco desta barra não é estético: com o superadmin operando dentro de um cliente
 * ela chegou a onze itens, e os últimos saíam da vista atrás de uma rolagem horizontal
 * sem indicação nenhuma — "motor de envio" simplesmente não existia para quem não
 * soubesse arrastar. O que os testes aqui travam é isso: todo caminho tem que estar
 * alcançável, em qualquer largura, sem depender de rolar algo invisível.
 */

/** O superadmin opera dentro de um cliente escolhido — o estado com mais itens na barra. */
async function seedSuperadmin(page: Page): Promise<void> {
  await seedSession(page, SUPERADMIN);
  await page.addInitScript(() => {
    localStorage.setItem('mmail_tenant', 't-acme');
    localStorage.setItem('mmail_tenant_name', 'Acme');
  });
}

/** Quanto do menu ficou fora da vista. Zero é a única resposta aceitável. */
async function sobraEscondida(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('.nav-links');
    return el ? el.scrollWidth - el.clientWidth : 0;
  });
}

test.describe('Navegação — agrupamentos', () => {
  test('o dia a dia fica à vista; configuração e plataforma ficam agrupadas', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/dashboard');

    const barra = page.locator('.nav-links');
    for (const rotulo of ['dashboard', 'listas', 'contatos', 'templates', 'campanhas', 'segmentos']) {
      await expect(barra.getByRole('link', { name: rotulo })).toBeVisible();
    }

    // Estes saíram da fileira — mas continuam a um clique de distância.
    await expect(page.getByRole('link', { name: 'SMTP' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Clientes' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'ajustes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'plataforma' })).toBeVisible();
  });

  test('o menu de ajustes leva ao SMTP', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'ajustes' }).click();
    await page.getByRole('menu').getByRole('link', { name: 'SMTP' }).click();

    await expect(page).toHaveURL(/\/smtp$/);
  });

  test('a barra mostra onde o usuário está mesmo quando a tela vive dentro de um menu', async ({ page }) => {
    // Sem isto, entrar em SMTP apagaria qualquer indicação de posição: o link ativo
    // está escondido dentro do painel fechado.
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/smtp');

    await expect(page.getByRole('button', { name: 'ajustes' })).toHaveClass(/is-active/);
    // Escopado à barra: o rótulo da marca ("ir para o dashboard") também casaria.
    await expect(page.locator('.nav-links').getByRole('link', { name: 'dashboard' })).not.toHaveClass(/active/);
  });

  test('a conta e a saída vivem no menu do próprio usuário', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: ADMIN.name }).click();
    await page.getByRole('menu').getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('mmail_token'))).toBeNull();
  });
});

test.describe('Navegação — centro', () => {
  /** Distância entre o centro do menu e o centro da tela. */
  async function desvioDoCentro(page: Page): Promise<number> {
    return page.evaluate(() => {
      const el = document.querySelector('.nav-links');
      if (!el) return 0;
      const c = el.getBoundingClientRect();
      return Math.round((c.left + c.right) / 2 - window.innerWidth / 2);
    });
  }

  // O menu já ficou 152px à esquerda: ele era centrado dentro da coluna do meio de um
  // grid, e essa coluna não é simétrica — o bloco do usuário é muito mais largo que a
  // marca. Quem olha a tela vê o desvio; quem olha só o CSS não.
  // Na largura mais apertada o bloco do usuário já está no mínimo e não tem mais como
  // ceder: a simetria perfeita só sairia cortando o nome do cliente. Alguns pixels de
  // desvio ali são o preço; 152px, não.
  for (const { largura, tolerancia } of [
    { largura: 1920, tolerancia: 2 },
    { largura: 1600, tolerancia: 2 },
    { largura: 1440, tolerancia: 8 },
  ]) {
    test(`o menu fica no centro da tela em ${largura}px, com o chip do cliente ocupando a direita`, async ({
      page,
    }) => {
      const api = new ApiMock({ user: SUPERADMIN });
      await api.install(page);
      await seedSuperadmin(page);
      await page.setViewportSize({ width: largura, height: 900 });

      await page.goto('/dashboard');
      await page.waitForSelector('.nav-links');
      await page.waitForTimeout(300);

      expect(Math.abs(await desvioDoCentro(page))).toBeLessThanOrEqual(tolerancia);
    });
  }

  test('e continua no centro para quem não tem o chip', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);
    await page.setViewportSize({ width: 1600, height: 900 });

    await page.goto('/dashboard');
    await page.waitForSelector('.nav-links');
    await page.waitForTimeout(300);

    expect(Math.abs(await desvioDoCentro(page))).toBeLessThanOrEqual(2);
  });
});

test.describe('Navegação — nada escondido', () => {
  for (const largura of [1920, 1600, 1440, 1280, 1100, 1024, 900, 768, 390]) {
    test(`nenhum item fica fora da vista em ${largura}px`, async ({ page }) => {
      const api = new ApiMock({ user: SUPERADMIN });
      await api.install(page);
      await seedSuperadmin(page);
      await page.setViewportSize({ width: largura, height: 900 });

      await page.goto('/dashboard');
      await page.waitForSelector('.navbar');
      // A barra se remede depois de montar; a decisão de recolher vem dessa medida.
      await page.waitForTimeout(300);

      expect(await sobraEscondida(page)).toBe(0);

      // Ou os links estão na barra, ou existe o botão que abre o painel com todos.
      const naBarra = await page.locator('.nav-links > a').count();
      const temPainel = await page.locator('.nav-burger').count();
      expect(naBarra > 0 || temPainel === 1).toBe(true);
    });
  }

  test('em tela estreita o painel recolhido dá acesso a tudo', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/dashboard');
    await expect(page.locator('.nav-burger')).toBeVisible();

    await page.locator('.nav-burger').click();
    const painel = page.locator('.nav-painel');

    // Inclusive o item que era o mais fácil de perder na versão com rolagem.
    for (const rotulo of ['dashboard', 'listas', 'contatos', 'SMTP', 'Clientes', 'Motor de envio']) {
      await expect(painel.getByRole('link', { name: rotulo })).toBeVisible();
    }

    await painel.getByRole('link', { name: 'contatos' }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    // Navegou: o painel sai da frente sozinho.
    await expect(page.locator('.nav-painel')).toBeHidden();
  });

  test('alargar a janela devolve a barra completa', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/dashboard');
    await expect(page.locator('.nav-burger')).toBeVisible();

    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(page.locator('.nav-burger')).toBeHidden();
    await expect(page.locator('.nav-links').getByRole('link', { name: 'campanhas' })).toBeVisible();
    expect(await sobraEscondida(page)).toBe(0);
  });
});
