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
