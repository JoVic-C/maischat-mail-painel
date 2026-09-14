import { Component, type OnDestroy, type OnInit } from '@angular/core';
import type { FailureRow, PlatformOverview } from '../../models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

const REFRESH_MS = 15_000;

/**
 * A lista de falhas expõe endereços de destinatários dos clientes: só carrega sob
 * clique e cada consulta é auditada no servidor.
 */
@Component({
  selector: 'app-operacao',
  templateUrl: './operacao.component.html',
  styleUrls: ['./operacao.component.scss'],
  standalone: false,
})
export class OperacaoComponent implements OnInit, OnDestroy {
  overview: PlatformOverview | null = null;
  loading = false;
  error: string | null = null;

  /** Em horas. */
  hours = 24;
  autoRefresh = true;

  failures: FailureRow[] = [];
  loadingFailures = false;
  failuresLoaded = false;

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private api: ApiService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
    this.startTimer();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private startTimer(): void {
    this.stopTimer();
    if (!this.autoRefresh) return;
    this.timer = setInterval(() => this.load(true), REFRESH_MS);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.startTimer();
  }

  changeWindow(hours: number): void {
    this.hours = hours;
    this.load();
  }

  load(silent = false): void {
    if (!silent) {
      this.loading = true;
      this.error = null;
    }
    this.api.platformOverview(this.hours).subscribe({
      next: (data) => {
        this.overview = data;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        // Falha na atualização automática não apaga o que já está na tela.
        if (silent) return;
        this.error = apiErrorMessage(err);
      },
    });
  }

  loadFailures(): void {
    this.loadingFailures = true;
    this.api.platformFailures(50).subscribe({
      next: (rows) => {
        this.failures = rows;
        this.failuresLoaded = true;
        this.loadingFailures = false;
      },
      error: (err) => {
        this.loadingFailures = false;
        this.toast.apiError(err);
      },
    });
  }

  errorsOf(row: { failed: number; bounced: number }): number {
    return row.failed + row.bounced;
  }

  trackByTenant(_i: number, row: { tenantId: string }): string {
    return row.tenantId;
  }
}
