import DOMPurify from 'dompurify';

/**
 * O template é HTML cru escrito por usuários do cliente: renderizá-lo sem isto é XSS
 * armazenado. Usar em todo `innerHTML` e também antes de `[innerHTML]`.
 */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, emailConfig());
}

/** Preserva o documento inteiro (`<head>` e `<style>`): como fragmento, a prévia perderia o layout. */
export function sanitizeEmailDocument(html: string): string {
  return DOMPurify.sanitize(html, { ...emailConfig(), WHOLE_DOCUMENT: true });
}

/**
 * Faz os links da prévia abrirem em nova aba, para o usuário poder testá-los. O `<base>` entra
 * depois da sanitização: o que vier do template continua barrado pelo FORBID_TAGS.
 */
export function abrirLinksEmNovaAba(documentoSanitizado: string): string {
  return documentoSanitizado.replace(/<head[^>]*>/i, (head) => `${head}<base target="_blank">`);
}

function emailConfig() {
  return {
    /*
     * Condicional do Outlook não sobrevive: o DOMPurify 3.x descarta comentário com
     * marcação (mXSS) e `SAFE_FOR_XML: false` abriria um vetor. Ver `seedEditor()`.
     */
    ADD_TAGS: ['style', '#comment'],
    ADD_ATTR: ['target', 'align', 'valign', 'bgcolor', 'background', 'cellpadding', 'cellspacing', 'border'],
    // Redundante com o padrão do DOMPurify, mas explícito: são os vetores que importam aqui.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link'],
  };
}
