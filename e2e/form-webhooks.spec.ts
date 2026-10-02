import { expect, test } from '@playwright/test';
import type { FormSubmission } from '../src/app/models';
import { ADMIN, ApiMock, OPERATOR, makeFormWebhook, makeTemplate, seedSession } from './fixtures/api-mock';

const TEMPLATE = makeTemplate({ name: 'Obrigado pelo contato' });

test.describe('Formulários — webhooks', () => {
  test('o menu de ajustes leva à tela de formulários', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN, templates: [TEMPLATE] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'ajustes' }).click();
    await page.getByRole('menu').getByRole('link', { name: 'Formulários' }).click();

    await expect(page).toHaveURL(/\/formularios$/);
    await expect(page.getByRole('heading', { name: 'Formulários' })).toBeVisible();
    await expect(page.getByText(/Nenhum webhook ainda/)).toBeVisible();
  });

  test('cria um webhook com o template escolhido e mostra a URL', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN, templates: [TEMPLATE, makeTemplate({ name: 'Outro' })] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/formularios');
    await page.getByRole('button', { name: '+ Novo webhook' }).click();
    const modal = page.getByRole('dialog', { name: 'Novo webhook' });
    await modal.locator('#fw-name').fill('Orçamento do site');
    await modal.locator('#fw-template').selectOption(TEMPLATE._id);
    await modal.locator('#fw-redirect').fill('https://cliente.com.br/obrigado');
    await modal.getByRole('button', { name: 'Criar webhook' }).click();

    await expect(modal).toBeHidden();
    expect(api.lastCallTo('/form-webhooks/save')?.body).toMatchObject({
      name: 'Orçamento do site',
      templateId: TEMPLATE._id,
      smtpId: null,
      hourlyLimit: 100,
      redirectUrl: 'https://cliente.com.br/obrigado',
      isActive: true,
    });
    const card = page.locator('[data-webhook="Orçamento do site"]');
    await expect(card).toContainText('/api/hooks/forms/');
    await expect(card).toContainText('Obrigado pelo contato');
  });

  test('não envia sem nome, sem template ou com página de obrigado inválida', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN, templates: [TEMPLATE, makeTemplate({ name: 'Outro' })] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/formularios');
    await page.getByRole('button', { name: '+ Novo webhook' }).click();
    const modal = page.getByRole('dialog', { name: 'Novo webhook' });
    await modal.locator('#fw-redirect').fill('cliente.com.br/obrigado');
    await modal.getByRole('button', { name: 'Criar webhook' }).click();

    await expect(modal.getByText(/Dê um nome/)).toBeVisible();
    await expect(modal.getByText('Escolha o template do email.')).toBeVisible();
    await expect(modal.getByText(/começando com https/)).toBeVisible();
    expect(api.callsTo('/form-webhooks/save')).toHaveLength(0);
  });

  test('sem template cadastrado, orienta a criar um e bloqueia o botão', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN, templates: [] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/formularios');

    await expect(page.getByText('Crie um template antes')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Novo webhook' })).toBeDisabled();
  });

  test('o histórico mostra o motivo da recusa e os campos recebidos', async ({ page }) => {
    const webhook = makeFormWebhook({ name: 'Contato', stats: { received: 2, sent: 1, failed: 0, rejected: 1 } });
    const submissions: FormSubmission[] = [
      {
        _id: 's1',
        email: '',
        name: 'Sem email',
        status: 'rejected',
        reason: 'Nenhum email válido encontrado nos campos enviados.',
        fields: { nome: 'Sem email', telefone: '1199990000' },
        createdAt: '2026-09-14T12:00:00.000Z',
        sentAt: null,
      },
      {
        _id: 's2',
        email: 'ana@x.com',
        name: 'Ana',
        status: 'sent',
        reason: '',
        fields: { nome: 'Ana', email: 'ana@x.com' },
        createdAt: '2026-09-14T11:00:00.000Z',
        sentAt: '2026-09-14T11:00:02.000Z',
      },
    ];
    const api = new ApiMock({ user: ADMIN, templates: [TEMPLATE], formWebhooks: [webhook], formSubmissions: { [webhook.id]: submissions } });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/formularios');
    await page.locator('[data-webhook="Contato"]').getByRole('button', { name: 'histórico' }).click();

    const modal = page.getByRole('dialog', { name: 'Histórico · Contato' });
    const recusa = modal.getByRole('row', { name: /recusado/ });
    await expect(recusa).toContainText('Nenhum email válido');
    await recusa.getByText('2 campos recebidos').click();
    await expect(recusa).toContainText('1199990000');
    await expect(modal.getByRole('row', { name: /ana@x.com/ })).toContainText('enviado');
  });

  test('pausar pelo menu mantém a configuração e só troca a situação', async ({ page }) => {
    const webhook = makeFormWebhook({ name: 'Contato', hourlyLimit: 30, emailField: 'email_contato' });
    const api = new ApiMock({ user: ADMIN, templates: [TEMPLATE], formWebhooks: [webhook] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/formularios');
    const card = page.locator('[data-webhook="Contato"]');
    await card.getByRole('button', { name: 'Ações do webhook Contato' }).click();
    await page.getByRole('menu').getByRole('button', { name: 'Pausar' }).click();

    await expect(card.getByText('pausado', { exact: true })).toBeVisible();
    expect(api.lastCallTo('/form-webhooks/save')?.body).toMatchObject({
      id: webhook.id,
      isActive: false,
      hourlyLimit: 30,
      emailField: 'email_contato',
    });
  });

  test('o guia de uso traz o código pronto com a URL do webhook', async ({ page }) => {
    const webhook = makeFormWebhook({ name: 'Contato' });
    const api = new ApiMock({ user: ADMIN, templates: [TEMPLATE], formWebhooks: [webhook] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/formularios');
    await page.locator('[data-webhook="Contato"]').getByRole('button', { name: 'como usar' }).click();

    const modal = page.getByRole('dialog', { name: 'Como usar · Contato' });
    await expect(modal.locator('pre')).toContainText(`action="${webhook.url}"`);
    await modal.getByRole('tab', { name: 'JavaScript' }).click();
    await expect(modal.locator('pre')).toContainText(`fetch('${webhook.url}'`);
  });

  test('usuário comum não chega na tela', async ({ page }) => {
    const api = new ApiMock({ user: OPERATOR, templates: [TEMPLATE] });
    await api.install(page);
    await seedSession(page, OPERATOR);

    await page.goto('/formularios');

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(api.callsTo('/form-webhooks')).toHaveLength(0);
  });
});
