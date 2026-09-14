import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN, ApiMock } from './fixtures/api-mock';

function base64url(valor: object): string {
  return Buffer.from(JSON.stringify(valor)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function jwtFalso(expiraEmSegundos: number): string {
  const agora = Math.floor(Date.now() / 1000);
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ id: ADMIN.id, iat: agora, exp: agora + expiraEmSegundos })}.assinatura`;
}

async function sessaoCom(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([t, user, tenant]) => {
      localStorage.setItem('mmail_token', t);
      localStorage.setItem('mmail_user', user);
      localStorage.setItem('mmail_tenant', tenant);
    },
    [token, JSON.stringify(ADMIN), ADMIN.tenantId as string] as const
  );
}

test.describe('Sessão por inatividade', () => {
  test('abrir o projeto com a sessão vencida leva ao login com aviso, sem chamar a API', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await sessaoCom(page, jwtFalso(-60));

    await page.goto('/campaigns');

    await expect(page).toHaveURL(/\/login\?sessao=expirada$/);
    await expect(page.getByText('Sua sessão expirou por inatividade. Entre novamente.')).toBeVisible();
    expect(api.calls).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('mmail_token'))).toBeNull();
  });

  test('sessão dentro do prazo abre normalmente', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await sessaoCom(page, jwtFalso(3600));

    await page.goto('/campaigns');

    await expect(page).toHaveURL(/\/campaigns$/);
  });

  test('o token renovado pela API substitui o salvo', async ({ page }) => {
    const renovado = jwtFalso(24 * 3600);
    const api = new ApiMock({ user: ADMIN, renewedToken: renovado });
    await api.install(page);
    await sessaoCom(page, jwtFalso(3600));

    await page.goto('/campaigns');

    await expect.poll(() => page.evaluate(() => localStorage.getItem('mmail_token'))).toBe(renovado);
  });

  test('entrar de novo depois do aviso volta ao painel e tira o aviso', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await sessaoCom(page, jwtFalso(-60));

    await page.goto('/dashboard');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Senha').fill('senhaCorreta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
