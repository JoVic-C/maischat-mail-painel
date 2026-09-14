import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN, ApiMock, SUPERADMIN, seedSession } from './fixtures/api-mock';

/** Todo item da barra tem que ser alcançável em qualquer largura, sem rolagem escondida. */

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
    // O link ativo fica escondido no painel fechado; o gatilho precisa indicar a posição.
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
  async function desvioDoCentro(page: Page): Promise<number> {
    return page.evaluate(() => {
      const el = document.querySelector('.nav-links');
      if (!el) return 0;
      const c = el.getBoundingClientRect();
      return Math.round((c.left + c.right) / 2 - window.innerWidth / 2);
    });
  }

  // O desvio só aparece na tela, não no CSS. Na largura mínima alguns pixels são
  // aceitos: a simetria perfeita exigiria cortar o nome do cliente.
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

    for (const rotulo of ['dashboard', 'listas', 'contatos', 'SMTP', 'Clientes', 'Motor de envio']) {
      await expect(painel.getByRole('link', { name: rotulo })).toBeVisible();
    }

    await painel.getByRole('link', { name: 'contatos' }).click();
    await expect(page).toHaveURL(/\/contacts$/);
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
