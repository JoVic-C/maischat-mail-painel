import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';

interface ServerFieldError {
  field?: string;
  message?: string;
  msg?: string;
}

/** Extrai a mensagem legível de um erro da API ({ error } ou { errors: [...] }). */
export function apiErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;

  if (err instanceof HttpErrorResponse) {
    // Sem resposta do servidor: rede fora, API no ar? (status 0)
    if (err.status === 0) return 'Sem conexão com o servidor. Verifique se a API está no ar.';
    const body = err.error as { error?: string; errors?: ServerFieldError[] } | null;
    return body?.errors?.[0]?.message || body?.errors?.[0]?.msg || body?.error || `Erro ${err.status}.`;
  }

  return (err as Error)?.message || 'Erro inesperado.';
}

/**
 * Faz o link entre erros 400 do backend (`{ errors: [{field, message}] }`) e os controls
 * de um FormGroup, fornecendo helpers `has()`/`get()` para o template aplicar borda
 * vermelha + mensagem por campo. Erros somem automaticamente quando o usuário edita o campo.
 *
 * Use também `apply(err, labels)` passando um mapa de path → nome amigável para gerar
 * banner descritivo, e `ServerErrorsHandler.scrollToFirstInvalid()` para rolar/focar
 * automaticamente o primeiro campo com erro.
 */
export class ServerErrorsHandler {
  errors: Record<string, string> = {};
  private subs = new Subscription();

  constructor(private form: FormGroup) {
    this.watch(form);
  }

  /**
   * Mapeia uma resposta de erro HTTP. Devolve um banner pronto pra exibir:
   * - Sem `labels`: mensagem geral do backend, ou erros sem campo concatenados.
   * - Com `labels`: lista descritiva por campo no formato "Nome do campo: mensagem do servidor".
   *   Múltiplos campos viram bullet list com `\n` (o `.error-msg` usa `white-space: pre-line`).
   */
  apply(err: HttpErrorResponse | unknown, labels: Record<string, string> = {}): string {
    this.errors = {};
    const httpErr = err as HttpErrorResponse;
    const payload = httpErr?.error;
    const list = payload?.errors;

    if (!Array.isArray(list) || !list.length) {
      return apiErrorMessage(err);
    }

    const orphans: string[] = [];
    list.forEach((e: ServerFieldError) => {
      const message = e.message || e.msg || '';
      if (!message) return;
      if (e.field && this.findControl(e.field)) {
        this.errors[e.field] = this.errors[e.field] || message;
      } else {
        orphans.push(message);
      }
    });

    const fieldList = this.buildFieldList(labels);
    const orphanText = orphans.join(' • ');

    if (fieldList && orphanText) return `${fieldList}\n\n${orphanText}`;
    if (fieldList) return fieldList;
    if (orphanText) return orphanText;
    return payload?.error || 'Dados inválidos.';
  }

  /** Monta a lista de campos com erro usando os labels passados como nome amigável. */
  private buildFieldList(labels: Record<string, string>): string {
    const entries = Object.entries(this.errors);
    if (!entries.length) return '';
    const lines = entries.map(([field, msg]) => `${labels[field] || field}: ${msg}`);
    if (lines.length === 1) return lines[0];
    return `Corrija os campos abaixo:\n• ${lines.join('\n• ')}`;
  }

  /** Rola até o primeiro elemento com `.is-invalid` e foca, se possível. */
  static scrollToFirstInvalid(): void {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>('.is-invalid');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof el.focus === 'function') {
        try {
          el.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    });
  }

  clear(): void {
    this.errors = {};
  }

  has(field: string): boolean {
    if (this.errors[field]) return true;
    const c = this.findControl(field);
    return !!(c && c.touched && c.invalid);
  }

  /** Mensagem do servidor (vazia se não houver). Não inclui erros locais do Angular. */
  get(field: string): string {
    return this.errors[field] || '';
  }

  /**
   * Mensagem a exibir no campo: a do servidor tem prioridade; na ausência dela,
   * a validação local do Angular (só depois que o usuário tocou no campo).
   * Sem esta combinação o campo ficaria vermelho sem dizer o porquê.
   */
  messageFor(field: string, local: Record<string, string> = {}): string {
    const fromServer = this.get(field);
    if (fromServer) return fromServer;
    const control = this.findControl(field);
    if (!control || !control.touched || control.valid) return '';
    return local[field] ?? 'Campo obrigatório.';
  }

  destroy(): void {
    this.subs.unsubscribe();
  }

  private watch(group: FormGroup, prefix = ''): void {
    Object.keys(group.controls).forEach((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const control = group.controls[key];
      if (control instanceof FormGroup) {
        this.watch(control, path);
        return;
      }
      this.subs.add(
        control.valueChanges.subscribe(() => {
          if (this.errors[path]) delete this.errors[path];
        })
      );
    });
  }

  private findControl(field: string): AbstractControl | null {
    return this.form.get(field);
  }
}
