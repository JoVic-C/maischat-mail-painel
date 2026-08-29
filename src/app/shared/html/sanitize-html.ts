import DOMPurify from 'dompurify';

/**
 * Sanitiza HTML de template de email antes de ele encostar no DOM do painel.
 *
 * Por que existe: o conteúdo do template é escrito por usuários do cliente e guardado
 * cru pelo backend (é HTML de email — precisa sair intacto no disparo). Renderizar esse
 * HTML no painel sem tratamento é XSS armazenado: qualquer usuário do tenant poderia
 * salvar `<img src=x onerror=...>` e executar script na sessão de quem abrisse o
 * template — inclusive um admin, cujo JWT vive no localStorage.
 *
 * Onde usar: em TODO ponto que injeta esse HTML no documento — tanto `innerHTML` direto
 * (que não passa pelo sanitizador do Angular) quanto o binding `[innerHTML]` (que passa,
 * mas cujo sanitizador já acumulou vários bypasses; na 18 eram CVEs abertos). Encadear os
 * dois é de graça: o DOMPurify é mais permissivo que o do Angular para marcação de email,
 * então o resultado visível não muda.
 *
 * O que NÃO faz: não protege o email enviado. Lá o HTML sai como foi salvo, e a defesa
 * é do cliente de email — que não executa script.
 */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    /*
     * `style` (tag) e os atributos de tabela abaixo são marcação que email de verdade
     * usa; sem eles, abrir um template no editor visual destruiria o layout.
     *
     * `#comment` mantém comentários simples. Atenção: comentário condicional do Outlook
     * (`<!--[if mso]><td>...<![endif]-->`) NÃO sobrevive — o DOMPurify 3.x descarta
     * comentário que contenha marcação, por proteção contra mXSS, e desligar isso
     * (`SAFE_FOR_XML: false`) abriria um vetor real. Quem chama avisa o usuário quando
     * isso acontece; ver `seedEditor()` em templates.component.ts.
     */
    ADD_TAGS: ['style', '#comment'],
    ADD_ATTR: ['target', 'align', 'valign', 'bgcolor', 'background', 'cellpadding', 'cellspacing', 'border'],
    // Redundante com o padrão do DOMPurify, mas explícito: são os vetores que importam aqui.
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link'],
  });
}
