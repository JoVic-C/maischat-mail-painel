/**
 * Entrega um arquivo recebido da API ao navegador.
 *
 * Existe porque três telas fazem exatamente isto (contatos recusados na importação,
 * relatório de envios e exportação de contatos) — e a versão copiada em cada uma
 * esquecia de liberar a URL temporária, que fica presa na memória da aba até o
 * recarregamento.
 *
 * O nome do arquivo vem do próprio servidor quando disponível: é ele quem sabe o nome
 * da lista ou da campanha, e assim os dois lados não podem discordar.
 */
export function baixarBlob(blob: Blob, nomePadrao: string, contentDisposition?: string | null): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoCabecalho(contentDisposition) || nomePadrao;
  a.click();
  URL.revokeObjectURL(url);
}

/** Extrai o filename do cabeçalho Content-Disposition, quando o servidor o envia. */
export function nomeDoCabecalho(contentDisposition?: string | null): string {
  if (!contentDisposition) return '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition);
  return match ? decodeURIComponent(match[1]) : '';
}
