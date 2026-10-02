import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { ImportCounters, ImportJob, ImportSampleRow, ImportStatus } from '../models';
import { ToastService } from '../shared/toast/toast.service';
import { ApiService } from './api.service';

export type TrackedPhase = 'validating' | 'done' | 'importing' | 'finished' | 'failed';

export interface TrackedImport {
  id: string;
  name: string;
  phase: TrackedPhase;
  counters: ImportCounters;
  sample: ImportSampleRow[];
  imported: number;
  skipped: number;
  listIds: string[];
  error: string;
  /** A última consulta falhou; o acompanhamento segue tentando. */
  reconnecting: boolean;
}

const POLL_MS = 2000;
/** Aba em segundo plano: ninguém está olhando, e a cota da API é por IP. */
const POLL_HIDDEN_MS = 6000;
const RETRY_MAX_MS = 30_000;
const RATE_LIMITED_MS = 15_000;

const PHASE_BY_STATUS: Record<ImportStatus, TrackedPhase | 'canceled'> = {
  uploaded: 'validating',
  validating: 'validating',
  validated: 'done',
  importing: 'importing',
  done: 'finished',
  failed: 'failed',
  canceled: 'canceled',
};

export function emptyCounters(): ImportCounters {
  return { rows: 0, new: 0, addToList: 0, inList: 0, already: 0, invalid: 0 };
}

/**
 * Acompanha a importação fora do modal: fechar a janela não interrompe o acompanhamento,
 * e o cartão no canto da tela mostra o progresso enquanto a pessoa usa o resto do sistema.
 */
@Injectable({ providedIn: 'root' })
export class ImportTrackerService {
  private readonly state = new BehaviorSubject<TrackedImport | null>(null);
  readonly state$ = this.state.asObservable();
  /** Fim da gravação, para as telas recarregarem contatos e contadores das listas. */
  readonly finished$ = new Subject<{ imported: number }>();

  private viewers = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: Subscription;
  private failures = 0;
  private resuming = false;

  constructor(
    private api: ApiService,
    private toast: ToastService
  ) {}

  get current(): TrackedImport | null {
    return this.state.value;
  }

  /** O modal de importação está aberto: o cartão do canto se esconde. */
  get hasViewer(): boolean {
    return this.viewers > 0;
  }

  attach(): void {
    this.viewers++;
  }

  detach(): void {
    this.viewers = Math.max(0, this.viewers - 1);
  }

  track(id: string, name: string, phase: TrackedPhase = 'validating'): void {
    this.state.next({
      id,
      name,
      phase,
      counters: emptyCounters(),
      sample: [],
      imported: 0,
      skipped: 0,
      listIds: [],
      error: '',
      reconnecting: false,
    });
    this.failures = 0;
    this.schedule(0);
  }

  /** Mesmo job em outra etapa, como ao confirmar a gravação depois da validação. */
  continueAs(phase: TrackedPhase): void {
    const current = this.current;
    if (!current) return;
    this.state.next({ ...current, phase, reconnecting: false });
    this.failures = 0;
    this.schedule(0);
  }

  /** Após recarregar a página: retoma a importação mais recente que ainda está aberta. */
  resumeOpen(): void {
    if (this.current || this.resuming) return;
    this.resuming = true;
    this.api.getOpenImports().subscribe({
      next: (open) => {
        this.resuming = false;
        const job = open[0];
        if (!job || this.current) return;
        const phase = PHASE_BY_STATUS[job.status];
        this.track(job.id, job.originalName, phase === 'canceled' ? 'validating' : phase);
      },
      // Falhar aqui só significa não retomar; uma importação nova continua possível.
      error: () => {
        this.resuming = false;
      },
    });
  }

  clear(): void {
    this.stop();
    this.failures = 0;
    this.state.next(null);
  }

  private get polling(): boolean {
    const phase = this.current?.phase;
    return phase === 'validating' || phase === 'importing';
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.request?.unsubscribe();
    this.request = undefined;
  }

  private schedule(delay: number): void {
    this.stop();
    const id = this.current?.id;
    if (!id) return;
    this.timer = setTimeout(() => {
      this.request = this.api.getImport(id).subscribe({
        next: (job) => {
          if (this.current?.id !== id) return;
          this.failures = 0;
          this.apply(job);
          if (this.polling) this.schedule(this.interval());
        },
        error: (err) => this.onError(id, err),
      });
    }, delay);
  }

  private interval(): number {
    return typeof document !== 'undefined' && document.hidden ? POLL_HIDDEN_MS : POLL_MS;
  }

  private onError(id: string, err: unknown): void {
    if (this.current?.id !== id) return;
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    // 404: o job expirou ou é de outro cliente. 401: o interceptor já encerrou a sessão.
    if (status === 404 || status === 401) {
      this.clear();
      return;
    }
    this.failures++;
    const current = this.current;
    if (current) this.state.next({ ...current, reconnecting: true });
    const wait = status === 429 ? RATE_LIMITED_MS : Math.min(POLL_MS * 2 ** (this.failures - 1), RETRY_MAX_MS);
    this.schedule(wait);
  }

  private apply(job: ImportJob): void {
    const current = this.current;
    if (!current) return;
    const phase = PHASE_BY_STATUS[job.status] ?? 'validating';
    if (phase === 'canceled') {
      this.clear();
      return;
    }

    const next: TrackedImport = {
      ...current,
      phase,
      name: job.originalName || current.name,
      counters: job.counters ?? emptyCounters(),
      sample: job.sample ?? [],
      imported: job.imported ?? 0,
      skipped: job.skipped ?? 0,
      listIds: job.listIds ?? [],
      error: job.error ?? '',
      reconnecting: false,
    };
    const wasPhase = current.phase;
    this.state.next(next);

    if (phase === 'finished' && wasPhase !== 'finished') {
      this.toast.success(`${next.imported} contato(s) importado(s).`);
      this.finished$.next({ imported: next.imported });
    }
    if (phase === 'failed' && wasPhase !== 'failed') {
      this.toast.error(next.error || 'Falha ao processar a importação.');
    }
  }
}
