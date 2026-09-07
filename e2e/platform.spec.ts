import { expect, test } from '@playwright/test';
import { ADMIN, ApiMock, DEFAULT_PLATFORM_SETTINGS, OPERATOR, SUPERADMIN, seedSession } from './fixtures/api-mock';

/**
 * Motor de envio — configuração da PLATAFORMA.
 *
 * O que precisa ficar travado aqui é o escopo: estes números valem para todos os
 * clientes, então quem não é superadmin não pode chegar na tela nem na rota. O resto
 * cobre a faixa aceita, que existe porque um valor absurdo derruba o envio de todo mundo.
 */

/** O superadmin opera dentro de um cliente escolhido; sem isso o tenantGuard desvia. */
async function seedSuperadmin(page: import('@playwright/test').Page): Promise<void> {
  await seedSession(page, SUPERADMIN);
  await page.addInitScript(() => {
    localStorage.setItem('mmail_tenant', 't-acme');
    localStorage.setItem('mmail_tenant_name', 'Acme');
  });
}

test.describe('Motor de envio — acesso', () => {
  test('superadmin abre a tela e vê os valores atuais', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');

    await expect(page.getByRole('heading', { name: 'Motor de envio' })).toBeVisible();
    await expect(page.locator('#pf-concurrency')).toHaveValue('5');
    await expect(page.locator('#pf-rate')).toHaveValue('600');
  });

  test('admin de cliente não chega na tela', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/plataforma');

    // superadminGuard desvia para o dashboard e nem chega a consultar a API.
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(api.callsTo('/platform-settings')).toHaveLength(0);
  });

  test('usuário comum não chega na tela', async ({ page }) => {
    const api = new ApiMock({ user: OPERATOR });
    await api.install(page);
    await seedSession(page, OPERATOR);

    await page.goto('/plataforma');

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(api.callsTo('/platform-settings')).toHaveLength(0);
  });

  test('o link no menu só aparece para o superadmin', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'motor de envio' })).toBeHidden();
  });

  test('e o superadmin alcança a tela pelo menu da plataforma', async ({ page }) => {
    // A metade positiva importa tanto quanto a negativa: sem ela, este arquivo
    // continuaria verde mesmo que o caminho sumisse para TODO mundo.
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'plataforma' }).click();
    await page.getByRole('menu').getByRole('link', { name: 'Motor de envio' }).click();

    await expect(page).toHaveURL(/\/plataforma$/);
    await expect(page.getByRole('heading', { name: 'Motor de envio' })).toBeVisible();
  });
});

test.describe('Motor de envio — edição', () => {
  test('salvar envia os dois campos e confirma', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');
    await page.locator('#pf-concurrency').fill('12');
    await page.locator('#pf-rate').fill('3000');
    await page.getByRole('button', { name: /Salvar e reiniciar/ }).click();

    await expect(page.getByText('Ajustes do motor de envio atualizados.')).toBeVisible();
    expect(api.lastCallTo('/platform-settings')?.body).toEqual({
      workerConcurrency: 12,
      ratePerMinute: 3000,
    });
  });

  test('a tela traduz a taxa para uma grandeza compreensível', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');
    await page.locator('#pf-rate').fill('1000');

    // 1000/min = 60.000/h — o número por minuto sozinho não diz muita coisa.
    await expect(page.getByText(/60,?\.?000 por hora/)).toBeVisible();
  });

  test('valor fora da faixa não chega à API', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');
    await page.locator('#pf-concurrency').fill('999'); // teto é 50
    await page.getByRole('button', { name: /Salvar e reiniciar/ }).click();

    await expect(page.getByText(/dentro da faixa permitida/)).toBeVisible();
    expect(api.callsTo('/platform-settings').filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  test('erro por campo do servidor aparece no formulário', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    api.fail('savePlatformSettings', 400, {
      errors: [{ field: 'ratePerMinute', message: 'Acima do contratado com o provedor.' }],
    });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');
    await page.locator('#pf-rate').fill('90000');
    await page.getByRole('button', { name: /Salvar e reiniciar/ }).click();

    await expect(page.getByText('Emails por minuto: Acima do contratado com o provedor.')).toBeVisible();
  });

  test('sem alterar nada, não há o que salvar', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');

    await expect(page.getByRole('button', { name: /Salvar e reiniciar/ })).toBeDisabled();
  });

  test('falha ao carregar mostra o erro e permite tentar de novo', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    api.fail('platformSettings', 500, { error: 'Banco indisponível.' });
    await api.install(page);
    await seedSuperadmin(page);

    await page.goto('/plataforma');
    await expect(page.getByText('Banco indisponível.')).toBeVisible();

    api.failures.delete('platformSettings');
    api.platformSettings = { ...DEFAULT_PLATFORM_SETTINGS, workerConcurrency: 8 };
    await page.getByRole('button', { name: '↻ Tentar novamente' }).click();

    await expect(page.locator('#pf-concurrency')).toHaveValue('8');
  });
});
