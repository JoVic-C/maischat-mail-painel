import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { apiErrorMessage } from '../server-errors/server-errors';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  title?: string;
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private subject = new Subject<Toast>();
  private dismissSubject = new Subject<number>();
  private nextId = 1;

  toasts$: Observable<Toast> = this.subject.asObservable();
  dismiss$: Observable<number> = this.dismissSubject.asObservable();

  success(message: string, title?: string, durationMs = 4500): number {
    return this.push({ kind: 'success', message, title, durationMs });
  }
  error(message: string, title?: string, durationMs = 6500): number {
    return this.push({ kind: 'error', message, title, durationMs });
  }
  info(message: string, title?: string, durationMs = 4500): number {
    return this.push({ kind: 'info', message, title, durationMs });
  }
  warn(message: string, title?: string, durationMs = 5500): number {
    return this.push({ kind: 'warn', message, title, durationMs });
  }

  /** Atalho para erros de API: extrai a mensagem do corpo e exibe como toast de erro. */
  apiError(err: unknown, title?: string): number {
    return this.error(apiErrorMessage(err), title);
  }

  dismiss(id: number): void {
    this.dismissSubject.next(id);
  }

  private push(t: Omit<Toast, 'id'>): number {
    const id = this.nextId++;
    this.subject.next({ id, ...t });
    return id;
  }
}
