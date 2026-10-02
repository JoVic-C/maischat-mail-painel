import { expect, type Page, test } from '@playwright/test';
import { ApiMock, type MockSeed, seedSession } from './fixtures/api-mock';

/** Importação de contatos: upload multipart, progresso e gravação só na confirmação explícita. */

function contadores(over: Partial<Record<string, number>> = {}) {
  return { rows: 0, new: 0, addToList: 0, inList: 0, already: 0, invalid: 0, ...over };
}

async function abrirImportacao(page: Page, seed: MockSeed = {}): Promise<ApiMock> {
  const api = new ApiMock(seed);
  await api.install(page);
  await seedSession(page);
  await page.goto('/contacts');
  await page.getByRole('button', { name: 'Importar contatos' }).click();
  return api;
}

const CSV = 'nome;email\nAna;ana@x.com\nBruno;bruno@x.com';

test.describe('Importação de contatos — envio do arquivo', () => {
  test('aceita .csv e .xlsx no seletor de arquivo', async ({ page }) => {
    await abrirImportacao(page);

    const accept = await page.locator('input[type=file]').getAttribute('accept');
    expect(accept).toContain('.csv');
    expect(accept).toContain('.xlsx');
  });

  test('sem arquivo nem texto, o botão de validar fica desabilitado', async ({ page }) => {
    await abrirImportacao(page);
    await expect(page.getByRole('button', { name: 'Validar' })).toBeDisabled();
  });

  test('o conteúdo colado sobe como ARQUIVO, não dentro de um JSON', async ({ page }) => {
    // Corpo JSON com o CSV inteiro estourava o limite do proxy.
    const api = await abrirImportacao(page, {
      importStates: [{ id: 'job-1', status: 'validated', counters: contadores({ rows: 2, new: 2 }), sample: [], listIds: [] }],
    });

    await page.getByLabel('Ou cole o conteúdo').fill(CSV);

    // Espera a requisição em si: o formato do envio está no cabeçalho.
    const [requisicao] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/contacts/import')),
      page.getByRole('button', { name: 'Validar' }).click(),
    ]);

    expect(requisicao.headers()['content-type']).toContain('multipart/form-data');
    expect(api.callsTo('/contacts/import').length).toBeGreaterThan(0);
  });
});

test.describe('Importação de contatos — conferência antes de gravar', () => {
  test('mostra os contadores da validação e só então oferece importar', async ({ page }) => {
    await abrirImportacao(page, {
      importStates: [
        { id: 'job-1', status: 'validating', counters: contadores({ rows: 1, new: 1 }), sample: [], listIds: [] },
        {
          id: 'job-1',
          status: 'validated',
          originalName: 'contatos.csv',
          counters: contadores({ rows: 10, new: 6, addToList: 2, inList: 1, already: 0, invalid: 1 }),
          sample: [{ email: 'ana@x.com', kind: 'new' }],
          listIds: [],
        },
      ],
    });

    await page.getByLabel('Ou cole o conteúdo').fill(CSV);
    await page.getByRole('button', { name: 'Validar' }).click();

    await expect(page.getByText('Validação concluída')).toBeVisible();
    await expect(page.getByRole('button', { name: /Importar 8 contato/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Baixar os incorretos \(1\)/ })).toBeVisible();
  });

  test('nada é gravado enquanto o usuário não confirma', async ({ page }) => {
    const api = await abrirImportacao(page, {
      importStates: [
        { id: 'job-1', status: 'validated', counters: contadores({ rows: 5, new: 5 }), sample: [], listIds: [] },
      ],
    });

    await page.getByLabel('Ou cole o conteúdo').fill(CSV);
    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(page.getByText('Validação concluída')).toBeVisible();

    expect(api.callsTo('/confirm')).toHaveLength(0);
  });

  test('sem nada para importar, o botão fica desabilitado', async ({ page }) => {
    // Arquivo em que todos já estavam cadastrados: importar não faria nada.
    await abrirImportacao(page, {
      importStates: [
        { id: 'job-1', status: 'validated', counters: contadores({ rows: 4, inList: 4 }), sample: [], listIds: [] },
      ],
    });

    await page.getByLabel('Ou cole o conteúdo').fill(CSV);
    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(page.getByText('Validação concluída')).toBeVisible();
    await expect(page.getByRole('button', { name: /Importar 0 contato/ })).toBeDisabled();
  });

  test('confirmar dispara a gravação e mostra o resultado', async ({ page }) => {
    const api = await abrirImportacao(page, {
      importStates: [
        { id: 'job-1', status: 'validated', counters: contadores({ rows: 3, new: 3 }), sample: [], listIds: [] },
        { id: 'job-1', status: 'done', imported: 3, skipped: 0, counters: contadores({ rows: 3, new: 3 }), sample: [], listIds: [] },
      ],
    });

    await page.getByLabel('Ou cole o conteúdo').fill(CSV);
    await page.getByRole('button', { name: 'Validar' }).click();
    await page.getByRole('button', { name: /Importar 3 contato/ }).click();

    // Ao concluir, o resultado chega pelo aviso, não por uma etapa dentro do modal.
    await expect(page.getByText('3 contato(s) importado(s).')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(api.callsTo('/confirm')).toHaveLength(1);
  });
});

const VALIDANDO = { id: 'job-1', status: 'validating', originalName: 'base.csv', counters: contadores({ rows: 1234, new: 1200, invalid: 34 }), sample: [], listIds: [] };
const VALIDADO = {
  id: 'job-1',
  status: 'validated',
  originalName: 'base.csv',
  counters: contadores({ rows: 1500, new: 1400, addToList: 50, invalid: 50 }),
  sample: [],
  listIds: [],
};

async function comValidacaoIniciada(page: Page, importStates: Record<string, unknown>[]): Promise<ApiMock> {
  const api = await abrirImportacao(page, { importStates });
  await page.getByLabel('Ou cole o conteúdo').fill(CSV);
  await page.getByRole('button', { name: 'Validar' }).click();
  return api;
}

test.describe('Importação de contatos — acompanhamento', () => {
  test('a contagem mostra as linhas verificadas', async ({ page }) => {
    await comValidacaoIniciada(page, [VALIDANDO]);

    await expect(page.getByText('1.234 linhas verificadas')).toBeVisible();
  });

  test('consulta em ritmo constante, sem espaçar até parecer travado', async ({ page }) => {
    const momentos: number[] = [];
    const api = new ApiMock({ importStates: [VALIDANDO] });
    await api.install(page);
    await seedSession(page);
    await page.route('**/api/contacts/import/job-1', async (route) => {
      momentos.push(Date.now());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VALIDANDO) });
    });

    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Importar contatos' }).click();
    await page.locator('textarea').fill(CSV);
    await page.getByRole('button', { name: 'Validar' }).click();
    await page.waitForTimeout(7000);

    const intervalos = momentos.slice(1).map((t, i) => t - momentos[i]);
    expect(momentos.length).toBeGreaterThanOrEqual(3);
    // Não martela a API: a cota da rota de progresso é por IP.
    expect(momentos.length).toBeLessThanOrEqual(6);
    expect(Math.max(...intervalos)).toBeLessThan(3000);
  });

  test('uma falha na consulta não encerra o acompanhamento', async ({ page }) => {
    let chamadas = 0;
    const api = new ApiMock({ importStates: [VALIDANDO] });
    await api.install(page);
    await seedSession(page);
    await page.route('**/api/contacts/import/job-1', async (route) => {
      chamadas++;
      if (chamadas === 2) {
        await route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"Bad gateway"}' });
        return;
      }
      const corpo = chamadas >= 3 ? VALIDADO : VALIDANDO;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    });

    await page.goto('/contacts');
    await page.getByRole('button', { name: 'Importar contatos' }).click();
    await page.locator('textarea').fill(CSV);
    await page.getByRole('button', { name: 'Validar' }).click();

    await expect(page.getByText('Validação concluída')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Importar 1450 contato/ })).toBeVisible();
  });
});

test.describe('Importação de contatos — minimizada', () => {
  test('minimizar fecha a janela, mostra o progresso no canto e deixa navegar', async ({ page }) => {
    await comValidacaoIniciada(page, [VALIDANDO]);
    await expect(page.getByText('1.234 linhas verificadas')).toBeVisible();

    await page.getByRole('button', { name: 'Minimizar' }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    const cartao = page.getByRole('complementary', { name: 'Importação de contatos' });
    await expect(cartao).toContainText('Validando contatos…');
    await expect(cartao).toContainText('base.csv');
    await expect(cartao).toContainText('1.234 linhas verificadas');

    await page.getByRole('link', { name: 'campanhas' }).click();
    await expect(page).toHaveURL(/\/campaigns$/);
    await expect(cartao).toBeVisible();
  });

  test('validação concluída com a janela minimizada: o cartão leva para revisar e importar', async ({ page }) => {
    await comValidacaoIniciada(page, [VALIDANDO, VALIDADO]);
    await page.getByRole('button', { name: 'Minimizar' }).click();
    // Escopado à barra: o rótulo do logo ("ir para o dashboard") também casaria.
    await page.locator('.nav-links').getByRole('link', { name: 'dashboard' }).click();

    const cartao = page.getByRole('complementary', { name: 'Importação de contatos' });
    await expect(cartao).toContainText('Validação concluída');
    await cartao.getByRole('button', { name: 'Revisar e importar' }).click();

    await expect(page).toHaveURL(/\/contacts$/);
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('Validação concluída');
    await expect(dialogo.getByRole('button', { name: /Importar 1450 contato/ })).toBeVisible();
    await expect(cartao).toBeHidden();
  });

  test('gravação concluída minimizada avisa, recarrega a tabela e o cartão mostra o resultado', async ({ page }) => {
    const api = await comValidacaoIniciada(page, [
      VALIDADO,
      { ...VALIDADO, status: 'importing', imported: 200 },
      { ...VALIDADO, status: 'done', imported: 1450, skipped: 0 },
    ]);
    await page.getByRole('button', { name: /Importar 1450 contato/ }).click();
    await page.getByRole('button', { name: 'Minimizar' }).click();
    const consultasAntes = api.callsTo('/contacts').filter((c) => c.path === '/contacts').length;

    await expect(page.getByText('1450 contato(s) importado(s).')).toBeVisible({ timeout: 10_000 });
    const cartao = page.getByRole('complementary', { name: 'Importação de contatos' });
    await expect(cartao).toContainText('Importação concluída');
    await expect(cartao).toContainText('1.450 contatos importados');
    expect(api.callsTo('/contacts').filter((c) => c.path === '/contacts').length).toBeGreaterThan(consultasAntes);

    await cartao.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(cartao).toBeHidden();
  });

  test('depois de recarregar a página, o cartão retoma a importação em andamento', async ({ page }) => {
    const api = new ApiMock({
      openImports: [{ id: 'job-1', status: 'validating', originalName: 'base.csv', createdAt: '2026-09-22T12:00:00.000Z' }],
      importStates: [VALIDANDO],
    });
    await api.install(page);
    await seedSession(page);

    await page.goto('/dashboard');

    const cartao = page.getByRole('complementary', { name: 'Importação de contatos' });
    await expect(cartao).toContainText('Validando contatos…');
    await expect(cartao).toContainText('1.234 linhas verificadas');
  });

  test('descartar uma validação pendente pelo cartão pede confirmação e cancela no servidor', async ({ page }) => {
    const api = new ApiMock({
      openImports: [{ id: 'job-1', status: 'validated', originalName: 'base.csv', createdAt: '2026-09-22T12:00:00.000Z' }],
      importStates: [VALIDADO],
    });
    await api.install(page);
    await seedSession(page);
    await page.goto('/dashboard');

    const cartao = page.getByRole('complementary', { name: 'Importação de contatos' });
    await cartao.getByRole('button', { name: 'Descartar importação' }).click();
    await page.getByRole('dialog', { name: 'Descartar importação' }).getByRole('button', { name: 'Descartar' }).click();

    await expect(cartao).toBeHidden();
    expect(api.callsTo('/contacts/import/job-1/cancel')).toHaveLength(1);
  });
});
