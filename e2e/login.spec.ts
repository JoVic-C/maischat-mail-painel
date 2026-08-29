import { expect, test } from '@playwright/test';
import { ADMIN, ApiMock, OPERATOR, SUPERADMIN, TEST_TOKEN, seedSession } from './fixtures/api-mock';

test.describe('Login', () => {
  test('rota protegida sem sessão manda para o login', async ({ page }) => {
    const api = new ApiMock();
    await api.install(page);

    await page.goto('/campaigns');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    // O guard barra antes de qualquer requisição — nada de vazar chamada sem token.
    expect(api.calls).toHaveLength(0);
  });

  test('validação local barra o envio e explica cada campo', async ({ page }) => {
    const api = new ApiMock();
    await api.install(page);

    await page.goto('/login');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Informe um email válido.')).toBeVisible();
    await expect(page.getByText('Informe a senha.')).toBeVisible();
    expect(api.callsTo('/auth/login')).toHaveLength(0);
  });

  test('email malformado não chega à API', async ({ page }) => {
    const api = new ApiMock();
    await api.install(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill('nao-e-email');
    await page.getByLabel('Senha').fill('umaSenhaQualquer');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Informe um email válido.')).toBeVisible();
    expect(api.callsTo('/auth/login')).toHaveLength(0);
  });

  test('credencial inválida mostra o erro do servidor e mantém na tela', async ({ page }) => {
    const api = new ApiMock();
    api.fail('login', 401, { error: 'Email ou senha inválidos.' });
    await api.install(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@empresa.com');
    await page.getByLabel('Senha').fill('senhaErrada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Email ou senha inválidos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    // Falhou: não pode ter gravado sessão nenhuma.
    expect(await page.evaluate(() => localStorage.getItem('mmail_token'))).toBeNull();
  });

  test('erro por campo do backend vira mensagem com o rótulo amigável', async ({ page }) => {
    const api = new ApiMock();
    api.fail('login', 400, { errors: [{ field: 'password', message: 'Senha expirada. Defina uma nova.' }] });
    await api.install(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@empresa.com');
    await page.getByLabel('Senha').fill('senha-antiga');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Senha: Senha expirada. Defina uma nova.')).toBeVisible();
  });

  test('admin entra e cai no dashboard, com sessão e tenant persistidos', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@empresa.com');
    await page.getByLabel('Senha').fill('senhaCorreta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);

    const session = await page.evaluate(() => ({
      token: localStorage.getItem('mmail_token'),
      tenant: localStorage.getItem('mmail_tenant'),
      user: localStorage.getItem('mmail_user'),
    }));
    expect(session.token).toBe(TEST_TOKEN);
    // Admin opera sempre no próprio cliente — o tenant é fixado já no login.
    expect(session.tenant).toBe(ADMIN.tenantId);
    expect(JSON.parse(session.user ?? '{}')).toMatchObject({ email: ADMIN.email, role: 'admin' });
  });

  test('usuário comum também entra no dashboard', async ({ page }) => {
    const api = new ApiMock({ user: OPERATOR });
    await api.install(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(OPERATOR.email);
    await page.getByLabel('Senha').fill('senhaCorreta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('superadmin é levado a escolher o cliente, sem tenant fixado', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(SUPERADMIN.email);
    await page.getByLabel('Senha').fill('senhaCorreta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/clientes$/);
    // Ele não pertence a cliente algum: nada de tenant no storage até escolher um.
    expect(await page.evaluate(() => localStorage.getItem('mmail_tenant'))).toBeNull();
  });

  test('token recusado no meio da sessão desloga e limpa o storage', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    api.fail('campaigns', 401, { error: 'Token inválido.' });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/campaigns');

    await expect(page).toHaveURL(/\/login$/);
    const left = await page.evaluate(() => ({
      token: localStorage.getItem('mmail_token'),
      user: localStorage.getItem('mmail_user'),
      tenant: localStorage.getItem('mmail_tenant'),
    }));
    expect(left).toEqual({ token: null, user: null, tenant: null });
  });

  test('superadmin sem cliente escolhido não entra nas telas do painel', async ({ page }) => {
    const api = new ApiMock({ user: SUPERADMIN });
    await api.install(page);
    await seedSession(page, SUPERADMIN);

    await page.goto('/campaigns');

    // tenantGuard desvia: sem cliente em contexto a API responderia 400 em tudo.
    await expect(page).toHaveURL(/\/clientes$/);
    expect(api.callsTo('/campaigns')).toHaveLength(0);
  });
});
