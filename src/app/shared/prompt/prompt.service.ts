import { Injectable } from '@angular/core';

export interface PromptOptions {
  title?: string;
  message?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  type?: 'text' | 'email' | 'url';
}

/** Substitui o prompt() nativo, bloqueante e desabilitado em vários navegadores. */
@Injectable({ providedIn: 'root' })
export class PromptService {
  state: Required<PromptOptions> | null = null;
  value = '';
  private resolver?: (v: string | null) => void;

  ask(opts: PromptOptions): Promise<string | null> {
    this.state = {
      title: 'Informe um valor',
      message: '',
      placeholder: '',
      initialValue: '',
      confirmLabel: 'Confirmar',
      type: 'text',
      ...opts,
    };
    this.value = this.state.initialValue;
    return new Promise<string | null>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(result: string | null): void {
    this.state = null;
    const r = this.resolver;
    this.resolver = undefined;
    r?.(result);
  }
}
