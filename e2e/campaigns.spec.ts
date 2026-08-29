import { type Page, expect, test } from '@playwright/test';
import {
  ADMIN,
  ApiMock,
  type MockSeed,
  makeCampaign,
  makeList,
  makeLog,
  makeTemplate,
  seedSession,
} from './fixtures/api-mock';

const TEMPLATE = makeTemplate({ name: 'Boas vindas' });
const LIST = makeList({ name: 'Clientes' });

/** Abre a tela de campanhas já autenticado, com a API dublada. */
async function openCampaigns(page: Page, seed: MockSeed = {}): Promise<ApiMock> {
  const api = new ApiMock({ templates: [TEMPLATE], lists: [LIST], ...seed });
  await api.install(page);
  await seedSession(page, seed.user ?? ADMIN);
  await page.goto('/campaigns');
  return api;
}

test.describe('Campanhas — listagem', () => {
  test('sem campanhas, convida a criar a primeira', async ({ page }) => {
    await openCampaigns(page);

    await expect(page.getByText('Nenhuma campanha ainda. Crie a primeira!')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Nova campanha' })).toBeVisible();
  });

  test('mostra progresso e métricas de cada campanha', async ({ page }) => {
    await openCampaigns(page, {
      campaigns: [
        makeCampaign({
          name: 'Newsletter Julho',
          status: 'sending',
          stats: { total: 200, sent: 150, failed: 2, bounced: 1, opened: 60, clicked: 15, unsubscribed: 0 },
        }),
      ],
    });

    const row = page.getByRole('row', { name: /Newsletter Julho/ });
    await expect(row).toContainText('150/200');
    await expect(row.getByText('Enviando')).toBeVisible();
    // Percentuais são calculados sobre os enviados: 60/150 = 40%, 15/150 = 10%.
    await expect(row).toContainText('40%');
    await expect(row).toContainText('10%');
  });

  test('falha ao carregar mostra o erro e permite tentar de novo', async ({ page }) => {
    const api = new ApiMock({ templates: [TEMPLATE], lists: [LIST] });
    api.fail('campaigns', 500, { error: 'Banco indisponível.' });
    await api.install(page);
    await seedSession(page, ADMIN);
    await page.goto('/campaigns');

    await expect(page.getByText('Não foi possível carregar')).toBeVisible();
    await expect(page.getByText('Banco indisponível.')).toBeVisible();

    // Servidor volta ao normal: o retry recarrega sem sair da tela.
    api.failures.delete('campaigns');
    api.campaigns = [makeCampaign({ name: 'Retomada' })];
    await page.getByRole('button', { name: '↻ Tentar novamente' }).click();

    await expect(page.getByText('Retomada')).toBeVisible();
  });
});

test.describe('Campanhas — criação', () => {
  test('validação local barra o envio e aponta os três campos', async ({ page }) => {
    const api = await openCampaigns(page);

    await page.getByRole('button', { name: '+ Nova campanha' }).click();
    const modal = page.getByRole('dialog', { name: 'Nova campanha' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Criar campanha' }).click();

    await expect(modal.getByText('Informe um nome com ao menos 2 caracteres.')).toBeVisible();
    await expect(modal.getByText('Escolha o template do email.')).toBeVisible();
    await expect(modal.getByText('Selecione ao menos uma lista de destinatários.')).toBeVisible();
    expect(api.callsTo('/campaigns/save')).toHaveLength(0);
  });

  test('sem lista selecionada não envia, mesmo com o resto preenchido', async ({ page }) => {
    const api = await openCampaigns(page);

    await page.getByRole('button', { name: '+ Nova campanha' }).click();
    const modal = page.getByRole('dialog', { name: 'Nova campanha' });
    await modal.locator('#cp-name').fill('Campanha sem lista');
    await modal.locator('#cp-template').selectOption(TEMPLATE._id);
    await modal.getByRole('button', { name: 'Criar campanha' }).click();

    await expect(modal.getByText('Selecione ao menos uma lista de destinatários.')).toBeVisible();
    expect(api.callsTo('/campaigns/save')).toHaveLength(0);
  });

  test('cria a campanha com o payload correto e ela aparece na lista', async ({ page }) => {
    const api = await openCampaigns(page);

    await page.getByRole('button', { name: '+ Nova campanha' }).click();
    const modal = page.getByRole('dialog', { name: 'Nova campanha' });
    await modal.locator('#cp-name').fill('Newsletter Agosto');
    await modal.locator('#cp-template').selectOption(TEMPLATE._id);
    // Em <select multiple> com formControlName o Angular troca o value de cada option
    // por um id interno ("0", "1", ...), então a seleção tem de ser pelo rótulo visível.
    await modal.locator('#cp-lists').selectOption({ label: `${LIST.name} (${LIST.contactCount})` });
    await modal.getByRole('button', { name: 'Criar campanha' }).click();

    await expect(page.getByText('Campanha criada.')).toBeVisible();
    await expect(modal).toBeHidden();
    await expect(page.getByText('Newsletter Agosto')).toBeVisible();

    const saved = api.lastCallTo('/campaigns/save');
    expect(saved?.body).toMatchObject({
      name: 'Newsletter Agosto',
      templateId: TEMPLATE._id,
      listIds: [LIST._id],
      attachments: [],
    });
  });

  test('erro de campo do servidor aparece no formulário sem fechar o modal', async ({ page }) => {
    const api = await openCampaigns(page);
    api.fail('saveCampaign', 400, { errors: [{ field: 'name', message: 'Já existe campanha com esse nome.' }] });

    await page.getByRole('button', { name: '+ Nova campanha' }).click();
    const modal = page.getByRole('dialog', { name: 'Nova campanha' });
    await modal.locator('#cp-name').fill('Newsletter Julho');
    await modal.locator('#cp-template').selectOption(TEMPLATE._id);
    await modal.locator('#cp-lists').selectOption({ label: `${LIST.name} (${LIST.contactCount})` });
    await modal.getByRole('button', { name: 'Criar campanha' }).click();

    await expect(modal.getByText('Nome: Já existe campanha com esse nome.')).toBeVisible();
    await expect(modal).toBeVisible();
  });

  test('o formulário avisa quando não há template cadastrado', async ({ page }) => {
    await openCampaigns(page, { templates: [] });

    await page.getByRole('button', { name: '+ Nova campanha' }).click();
    const modal = page.getByRole('dialog', { name: 'Nova campanha' });

    await expect(modal.getByText(/Nenhum template cadastrado/)).toBeVisible();
  });
});

test.describe('Campanhas — disparo', () => {
  test('disparar para todos envia onlyDelivered=false e a campanha passa a enviando', async ({ page }) => {
    const api = await openCampaigns(page, { campaigns: [makeCampaign({ name: 'Newsletter Julho' })] });

    await page.getByRole('button', { name: /disparar/ }).click();

    const scope = page.getByRole('dialog', { name: /Disparar/ });
    await expect(scope).toBeVisible();
    await scope.getByRole('button', { name: /Todos os contatos das listas/ }).click();

    await expect(page.getByText('10 emails enfileirados.')).toBeVisible();
    expect(api.lastCallTo('/start')?.body).toEqual({ onlyDelivered: false });

    const row = page.getByRole('row', { name: /Newsletter Julho/ });
    await expect(row.getByText('Enviando')).toBeVisible();
    // Em envio, a ação principal vira pausar.
    await expect(row.getByRole('button', { name: /pausar/ })).toBeVisible();
  });

  test('disparar só para entregues envia onlyDelivered=true', async ({ page }) => {
    const api = await openCampaigns(page, { campaigns: [makeCampaign({ name: 'Reengajamento' })] });

    await page.getByRole('button', { name: /disparar/ }).click();
    await page
      .getByRole('dialog', { name: /Disparar/ })
      .getByRole('button', { name: /Só quem já recebeu antes/ })
      .click();

    await expect(page.getByText('10 emails enfileirados.')).toBeVisible();
    expect(api.lastCallTo('/start')?.body).toEqual({ onlyDelivered: true });
  });

  test('cancelar o escopo não dispara nada', async ({ page }) => {
    const api = await openCampaigns(page, { campaigns: [makeCampaign({ name: 'Newsletter Julho' })] });

    await page.getByRole('button', { name: /disparar/ }).click();
    const scope = page.getByRole('dialog', { name: /Disparar/ });
    await scope.getByRole('button', { name: 'Cancelar' }).click();

    await expect(scope).toBeHidden();
    expect(api.callsTo('/start')).toHaveLength(0);
  });

  test('pausa e retoma uma campanha em envio', async ({ page }) => {
    const api = await openCampaigns(page, {
      campaigns: [
        makeCampaign({
          name: 'Newsletter Julho',
          status: 'sending',
          stats: { total: 100, sent: 40, failed: 0, bounced: 0, opened: 10, clicked: 2, unsubscribed: 0 },
        }),
      ],
    });

    const row = page.getByRole('row', { name: /Newsletter Julho/ });
    await row.getByRole('button', { name: /pausar/ }).click();

    await expect(page.getByText('Campanha pausada.')).toBeVisible();
    await expect(row.getByText('Pausada')).toBeVisible();
    expect(api.callsTo('/pause')).toHaveLength(1);

    await row.getByRole('button', { name: /retomar/ }).click();

    await expect(page.getByText('Campanha retomada.')).toBeVisible();
    await expect(row.getByText('Enviando')).toBeVisible();
  });

  test('agendamento no passado é recusado antes de chamar a API', async ({ page }) => {
    const api = await openCampaigns(page, { campaigns: [makeCampaign({ name: 'Newsletter Julho' })] });

    await page.getByRole('button', { name: /agendar/ }).click();
    const modal = page.getByRole('dialog', { name: 'Agendar disparo' });
    await modal.locator('#cp-when').fill('2020-01-01T10:00');
    await modal.getByRole('button', { name: 'Agendar' }).click();

    await expect(page.getByText('A data de agendamento deve ser no futuro.')).toBeVisible();
    expect(api.callsTo('/schedule')).toHaveLength(0);
  });
});

test.describe('Campanhas — detalhe do disparo', () => {
  test('abre o resultado com métricas e os envios individuais', async ({ page }) => {
    await openCampaigns(page, {
      campaigns: [
        makeCampaign({
          name: 'Newsletter Julho',
          _id: 'c-newsletter',
          status: 'completed',
          stats: { total: 3, sent: 3, failed: 0, bounced: 1, opened: 2, clicked: 1, unsubscribed: 0 },
          linkStats: [{ url: 'https://maischat.com/promo', clicks: 7 }],
        }),
      ],
      logs: [
        makeLog({ email: 'ana@acme.com', status: 'opened', openCount: 2 }),
        makeLog({ email: 'bruno@acme.com', status: 'clicked', openCount: 1, clickCount: 1 }),
        makeLog({ email: 'inexistente@acme.com', status: 'bounced', error: 'mailbox not found' }),
      ],
    });

    await page.getByRole('button', { name: 'Newsletter Julho' }).click();

    const detail = page.getByRole('dialog', { name: 'Newsletter Julho' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Links mais clicados')).toBeVisible();
    await expect(detail.getByText('https://maischat.com/promo')).toBeVisible();

    await expect(detail.getByText('ana@acme.com')).toBeVisible();
    await expect(detail.getByText('bruno@acme.com')).toBeVisible();
    await expect(detail.getByRole('row', { name: /inexistente@acme.com/ }).getByText('Bounce')).toBeVisible();
  });

  test('filtrar por situação recarrega só os envios daquele status', async ({ page }) => {
    const api = await openCampaigns(page, {
      campaigns: [makeCampaign({ name: 'Newsletter Julho', _id: 'c-newsletter', status: 'completed' })],
      logs: [
        makeLog({ email: 'ana@acme.com', status: 'opened' }),
        makeLog({ email: 'inexistente@acme.com', status: 'bounced' }),
      ],
    });

    await page.getByRole('button', { name: 'Newsletter Julho' }).click();
    const detail = page.getByRole('dialog', { name: 'Newsletter Julho' });
    await detail.getByLabel('Filtrar envios por situação').selectOption('bounced');

    await expect(detail.getByText('inexistente@acme.com')).toBeVisible();
    await expect(detail.getByText('ana@acme.com')).toBeHidden();
    expect(api.lastCallTo('/logs')?.query).toMatchObject({ status: 'bounced' });
  });
});

test.describe('Campanhas — permissões', () => {
  test('usuário comum não carrega servidores SMTP nem escolhe um', async ({ page }) => {
    const api = await openCampaigns(page, {
      user: { id: 'u-op', email: 'operador@empresa.com', name: 'Olavo', role: 'user', tenantId: 't-acme' },
    });

    await page.getByRole('button', { name: '+ Nova campanha' }).click();
    const modal = page.getByRole('dialog', { name: 'Nova campanha' });

    await expect(modal.locator('#cp-smtp')).toBeHidden();
    // SMTP é rota de admin — o painel nem tenta buscar.
    expect(api.callsTo('/smtp')).toHaveLength(0);
  });
});
