import { expect, test } from '@playwright/test';
import { ADMIN, ApiMock, seedSession } from './fixtures/api-mock';
import type { Page } from '@playwright/test';

/**
 * Relatório de envios do dashboard.
 *
 * O valor da tela está no recorte: o operador escolhe o período e o agrupamento, e o
 * que ele escolheu tem que chegar à API. O resto cobre a leitura do gráfico — baldes
 * sem envio precisam aparecer, senão dois meses distantes viram barras vizinhas e o
 * intervalo parado some.
 */

interface Balde {
  inicio: string;
  enviados: number;
}

/** Instante de início de balde como o backend devolve: meia-noite em Brasília. */
function inicio(dia: string): string {
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

/**
 * Intercepta o relatório, guarda as URLs pedidas e responde a série informada.
 * Registrada depois do ApiMock, tem precedência sobre o handler genérico.
 */
async function interceptarRelatorio(page: Page, serie: Balde[] = []): Promise<string[]> {
  const pedidos: string[] = [];

  await page.route('**/api/dashboard/sends*', async (route) => {
    pedidos.push(route.request().url());
    const soma = (campo: keyof Balde) => serie.reduce((t, p) => t + Number(p[campo]), 0);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        de: inicio('2026-03-01'),
        ate: inicio('2026-09-06'),
        agrupamento: new URL(route.request().url()).searchParams.get('agrupamento') ?? 'day',
        totais: {
          registros: soma('enviados'),
          enviados: soma('enviados'),
          abertos: 0,
          clicados: 0,
          falhas: 0,
          bounces: 0,
          descadastros: 0,
        },
        taxas: { abertura: 0, clique: 0, falha: 0 },
        serie: serie.map((p) => ({
          ...p,
          registros: p.enviados,
          abertos: 0,
          clicados: 0,
          falhas: 0,
          bounces: 0,
          descadastros: 0,
        })),
      }),
    });
  });

  return pedidos;
}

async function abrirDashboard(page: Page, serie: Balde[] = []): Promise<string[]> {
  const api = new ApiMock({ user: ADMIN });
  await api.install(page);
  await seedSession(page, ADMIN);
  const pedidos = await interceptarRelatorio(page, serie);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Relatório de envios' })).toBeVisible();
  return pedidos;
}

test.describe('Relatório de envios — filtros', () => {
  test('abre nos últimos 30 dias, agrupado por dia', async ({ page }) => {
    const pedidos = await abrirDashboard(page, [{ inicio: inicio('2026-09-06'), enviados: 10 }]);

    await expect.poll(() => pedidos.length).toBeGreaterThan(0);
    const params = new URL(pedidos[0]).searchParams;
    expect(params.get('agrupamento')).toBe('day');

    // 30 dias: o intervalo pedido cobre 29 dias cheios mais o de hoje.
    const de = new Date(params.get('de') as string);
    const ate = new Date(params.get('ate') as string);
    const dias = Math.round((ate.getTime() - de.getTime()) / 86_400_000);
    expect(dias).toBe(30);

    await expect(page.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('cada atalho manda o agrupamento que cabe na janela', async ({ page }) => {
    const pedidos = await abrirDashboard(page, [{ inicio: inicio('2026-09-01'), enviados: 5 }]);

    // Um ano por dia daria 365 barras; o atalho de 12 meses já pede o mês.
    await page.getByRole('button', { name: '12 meses' }).click();
    await expect.poll(() => pedidos.length).toBe(2);
    expect(new URL(pedidos[1]).searchParams.get('agrupamento')).toBe('month');

    await page.getByRole('button', { name: '3 meses' }).click();
    await expect.poll(() => pedidos.length).toBe(3);
    expect(new URL(pedidos[2]).searchParams.get('agrupamento')).toBe('week');

    await page.getByRole('button', { name: '7 dias' }).click();
    await expect.poll(() => pedidos.length).toBe(4);
    expect(new URL(pedidos[3]).searchParams.get('agrupamento')).toBe('day');
  });

  test('período escolhido na mão sai do atalho e chega à API', async ({ page }) => {
    const pedidos = await abrirDashboard(page, [{ inicio: inicio('2026-05-10'), enviados: 3 }]);

    await page.locator('#rel-de').fill('2026-05-01');
    await page.locator('#rel-ate').fill('2026-05-31');
    await page.locator('#rel-agrup').selectOption('week');

    await expect.poll(() => pedidos.length).toBeGreaterThanOrEqual(4);
    const params = new URL(pedidos[pedidos.length - 1]).searchParams;
    expect(params.get('agrupamento')).toBe('week');
    // O fim vai até o último instante do dia, senão o próprio 31/05 entraria vazio.
    expect(params.get('de')).toContain('2026-05-01');
    expect(params.get('ate')).toContain('2026-05-31');

    // Nenhum atalho fica marcado quando o período é livre.
    await expect(page.locator('.periodo.ativo')).toHaveCount(0);
  });
});

test.describe('Relatório de envios — leitura do gráfico', () => {
  test('meses sem envio aparecem no gráfico, não somem', async ({ page }) => {
    // O backend só devolve os baldes com registro. Se a tela desenhasse só esses dois,
    // março e setembro sairiam colados e os cinco meses parados desapareceriam.
    await abrirDashboard(page, [
      { inicio: inicio('2026-03-01'), enviados: 1 },
      { inicio: inicio('2026-09-01'), enviados: 40 },
    ]);
    await page.getByRole('button', { name: '12 meses' }).click();

    await expect(page.locator('.chart .col')).toHaveCount(7);
    await expect(page.locator('.chart-x')).toContainText('mar/26');
    await expect(page.locator('.chart-x')).toContainText('set/26');
  });

  test('período sem nenhum envio mostra o vazio, não um gráfico em branco', async ({ page }) => {
    await abrirDashboard(page, []);

    await expect(page.getByText('Nenhum envio neste período.')).toBeVisible();
    await expect(page.locator('.chart .col')).toHaveCount(0);
  });

  test('falha ao carregar oferece tentar de novo', async ({ page }) => {
    const api = new ApiMock({ user: ADMIN });
    await api.install(page);
    await seedSession(page, ADMIN);

    let falhar = true;
    await page.route('**/api/dashboard/sends*', async (route) => {
      if (falhar) {
        falhar = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Falha ao montar o relatório.' }),
        });
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          de: inicio('2026-09-01'),
          ate: inicio('2026-09-06'),
          agrupamento: 'day',
          totais: { registros: 8, enviados: 8, abertos: 0, clicados: 0, falhas: 0, bounces: 0, descadastros: 0 },
          taxas: { abertura: 0, clique: 0, falha: 0 },
          serie: [
            {
              inicio: inicio('2026-09-06'),
              registros: 8,
              enviados: 8,
              abertos: 0,
              clicados: 0,
              falhas: 0,
              bounces: 0,
              descadastros: 0,
            },
          ],
        }),
      });
    });

    await page.goto('/dashboard');

    await expect(page.getByText('Falha ao montar o relatório.')).toBeVisible();
    await page.getByRole('button', { name: /tentar novamente/i }).click();
    await expect(page.locator('.chart .col')).toHaveCount(1);
  });
});
