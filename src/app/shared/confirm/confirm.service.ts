import { Injectable } from '@angular/core';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // botão de confirmar em vermelho (ações destrutivas)
}

/**
 * Confirmação estilizada reutilizável (substitui o confirm() nativo do navegador).
 * Uso: this.confirm.ask({ message: '...' }).then(ok => { if (ok) {...} });
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  state: Required<ConfirmOptions> | null = null;
  private resolver?: (v: boolean) => void;

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.state = {
      title: 'Confirmar',
      confirmLabel: 'OK',
      cancelLabel: 'Cancelar',
      danger: false,
      ...opts,
    };
    return new Promise<boolean>((resolve) => { this.resolver = resolve; });
  }

  resolve(result: boolean): void {
    this.state = null;
    const r = this.resolver;
    this.resolver = undefined;
    r?.(result);
  }
}
