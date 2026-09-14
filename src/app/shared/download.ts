/** Libera a URL temporária, que ficaria presa na memória da aba; o nome vem do servidor quando houver. */
export function baixarBlob(blob: Blob, nomePadrao: string, contentDisposition?: string | null): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoCabecalho(contentDisposition) || nomePadrao;
  a.click();
  URL.revokeObjectURL(url);
}

export function nomeDoCabecalho(contentDisposition?: string | null): string {
  if (!contentDisposition) return '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition);
  return match ? decodeURIComponent(match[1]) : '';
}
