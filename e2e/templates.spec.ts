import { expect, test } from '@playwright/test';
import { ADMIN, ApiMock, makeTemplate, seedSession } from './fixtures/api-mock';

/**
 * Regressão de segurança: XSS armazenado via HTML de template.
 *
 * O conteúdo do template é escrito por usuários do cliente e guardado cru pelo backend.
 * O editor visual injeta esse HTML com `innerHTML` direto — caminho que NÃO passa pelo
 * sanitizador do Angular. Sem `sanitizeEmailHtml()`, um usuário comum salva um payload
 * e ele executa na sessão de quem abrir o template (um admin, cujo JWT está no
 * localStorage). Estes testes falham se a sanitização for removida.
 */

/** Payloads que executam via innerHTML — `<script>` não executa por essa via, estes sim. */
const PAYLOAD_IMG = '<img src=x onerror="window.__xss_img = true">';
const PAYLOAD_SVG = '<svg><animate onbegin="window.__xss_svg = true" attributeName="x" dur="1s">';
const PAYLOAD_IFRAME = '<iframe src="javascript:window.__xss_frame = true"></iframe>';

/** Marcação legítima de email que a sanitização não pode destruir. */
const EMAIL_MARKUP = `
  <table cellpadding="8" cellspacing="0" border="0" bgcolor="#ffffff">
    <tr><td align="center" style="color:#16264F;font-size:18px">Olá {{name}}</td></tr>
  </table>
  <a href="https://maischat.com" target="_blank">Acessar</a>
  <!--[if mso]><td>Fallback do Outlook</td><![endif]-->
`;

test.describe('Templates — sanitização do editor', () => {
  test('payload salvo por outro usuário não executa ao abrir o template', async ({ page }) => {
    const malicioso = makeTemplate({
      name: 'Template comprometido',
      html: `<p>Conteúdo normal</p>${PAYLOAD_IMG}${PAYLOAD_SVG}${PAYLOAD_IFRAME}`,
    });
    const api = new ApiMock({ templates: [malicioso] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/templates');
    await page.getByRole('button', { name: 'editar' }).click();

    const editor = page.getByRole('textbox', { name: 'Conteúdo do email' });
    await expect(editor).toBeVisible();
    // O conteúdo legítimo continua lá — sanitizar não é apagar tudo.
    await expect(editor).toContainText('Conteúdo normal');

    // Nenhum dos handlers disparou.
    const executou = await page.evaluate(() => ({
      img: (window as unknown as Record<string, unknown>)['__xss_img'] ?? false,
      svg: (window as unknown as Record<string, unknown>)['__xss_svg'] ?? false,
      frame: (window as unknown as Record<string, unknown>)['__xss_frame'] ?? false,
    }));
    expect(executou).toEqual({ img: false, svg: false, frame: false });

    // E os vetores sumiram do DOM, não apenas deixaram de disparar.
    const html = await editor.innerHTML();
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onbegin');
    expect(html).not.toContain('<iframe');
  });

  test('marcação legítima de email sobrevive à sanitização', async ({ page }) => {
    const api = new ApiMock({ templates: [makeTemplate({ name: 'Boas vindas', html: EMAIL_MARKUP })] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/templates');
    await page.getByRole('button', { name: 'editar' }).click();

    const editor = page.getByRole('textbox', { name: 'Conteúdo do email' });
    const html = await editor.innerHTML();

    // Tabela e seus atributos de layout — sem eles o email desmonta.
    expect(html).toContain('<table');
    expect(html).toContain('cellpadding');
    expect(html).toContain('bgcolor');
    expect(html).toContain('align="center"');
    expect(html).toContain('style="color:#16264F;font-size:18px"');
    // Link com target e a variável do handlebars.
    expect(html).toContain('target="_blank"');
    expect(html).toContain('{{name}}');
  });

  test('condicional do Outlook é removida, mas o usuário é avisado', async ({ page }) => {
    const api = new ApiMock({ templates: [makeTemplate({ name: 'Com fallback', html: EMAIL_MARKUP })] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/templates');
    await page.getByRole('button', { name: 'editar' }).click();

    // O DOMPurify descarta comentário com marcação dentro (proteção contra mXSS) —
    // desligar isso abriria vetor real, então a perda é aceita e comunicada.
    const html = await page.getByRole('textbox', { name: 'Conteúdo do email' }).innerHTML();
    expect(html).not.toContain('[if mso]');
    await expect(page.getByText(/trechos condicionais do Outlook/i)).toBeVisible();
  });

  test('template sem condicional não dispara o aviso', async ({ page }) => {
    const api = new ApiMock({ templates: [makeTemplate({ name: 'Simples', html: '<p>Olá {{name}}</p>' })] });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/templates');
    await page.getByRole('button', { name: 'editar' }).click();

    await expect(page.getByRole('textbox', { name: 'Conteúdo do email' })).toContainText('Olá');
    await expect(page.getByText(/trechos condicionais do Outlook/i)).toBeHidden();
  });

  test('a prévia também não executa o payload', async ({ page }) => {
    const api = new ApiMock({
      templates: [makeTemplate({ name: 'Template comprometido', html: `<p>Oi</p>${PAYLOAD_IMG}` })],
    });
    await api.install(page);
    await seedSession(page, ADMIN);

    await page.goto('/templates');
    await page.getByRole('button', { name: 'editar' }).click();

    // openEdit dispara preview(); o dublê devolve o mesmo HTML que o backend renderizaria.
    await expect(page.getByText('Prévia (com dados de exemplo)')).toBeVisible();
    await expect(page.locator('.preview')).toContainText('Oi');

    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>)['__xss_img'] ?? false)).toBe(false);
    expect(await page.locator('.preview').innerHTML()).not.toContain('onerror');
  });
});
