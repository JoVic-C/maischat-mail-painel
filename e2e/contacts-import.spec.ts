import { expect, type Page, test } from '@playwright/test';
import { ApiMock, type MockSeed, seedSession } from './fixtures/api-mock';

/**
 * Importação de contatos — o fluxo mais novo do painel e o de maior risco: o operador
 * sobe a base inteira de um cliente e decide, olhando os números, se grava.
 *
 * O alvo aqui é a interface: que o arquivo suba como multipart (e não como JSON, que
 * era o teto do desenho anterior), que o progresso apareça, e que a gravação só
 * aconteça na confirmação explícita.
 */

/** Contadores no formato que o backend devolve. */
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
    // É o que removeu o teto de tamanho: um corpo JSON com o CSV inteiro estourava o
    // limite do proxy muito antes do limite do produto.
    const api = await abrirImportacao(page, {
      importStates: [{ id: 'job-1', status: 'validated', counters: contadores({ rows: 2, new: 2 }), sample: [], listIds: [] }],
    });

    await page.getByLabel('Ou cole o conteúdo').fill(CSV);

    // Espera a requisição em si, em vez de consultar o dublê num laço com prazo: o
    // que se quer afirmar é o formato do envio, e ele está no cabeçalho.
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

    // Ao concluir, a tela de contatos fecha o modal e recarrega a lista — o resultado
    // chega pelo aviso, não por uma etapa final dentro do modal.
    await expect(page.getByText('3 contato(s) importado(s).')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(api.callsTo('/confirm')).toHaveLength(1);
  });
});
