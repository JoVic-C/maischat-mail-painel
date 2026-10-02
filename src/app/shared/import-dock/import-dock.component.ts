import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ImportTrackerService, TrackedImport } from '../../services/import-tracker.service';
import { ConfirmService } from '../confirm/confirm.service';
import { ToastService } from '../toast/toast.service';

/** Cartão no canto da tela com a importação em andamento, enquanto o modal está fechado. */
@Component({
  selector: 'app-import-dock',
  templateUrl: './import-dock.component.html',
  styleUrls: ['./import-dock.component.scss'],
  standalone: false,
})
export class ImportDockComponent implements OnInit, OnDestroy {
  constructor(
    private tracker: ImportTrackerService,
    private auth: AuthService,
    private api: ApiService,
    private router: Router,
    private confirm: ConfirmService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    // Após F5: a importação continuou no servidor e o cartão volta a acompanhar.
    if (this.auth.hasTenantContext) this.tracker.resumeOpen();
  }

  ngOnDestroy(): void {
    // Só é destruído ao sair da conta.
    this.tracker.clear();
  }

  /** Lido direto do serviço a cada ciclo: uma cópia poderia ficar com um estado velho. */
  get job(): TrackedImport | null {
    return this.tracker.hasViewer ? null : this.tracker.current;
  }

  title(job: TrackedImport): string {
    switch (job.phase) {
      case 'validating':
        return 'Validando contatos…';
      case 'importing':
        return 'Importando contatos…';
      case 'done':
        return 'Validação concluída';
      case 'finished':
        return 'Importação concluída';
      default:
        return 'Importação interrompida';
    }
  }

  count(job: TrackedImport): string {
    const fmt = (n: number) => n.toLocaleString('pt-BR');
    const importable = job.counters.new + job.counters.addToList;
    switch (job.phase) {
      case 'importing':
        return `${fmt(job.imported + job.skipped)} de ${fmt(importable)} gravados`;
      case 'finished':
        return `${fmt(job.imported)} ${job.imported === 1 ? 'contato importado' : 'contatos importados'}`;
      case 'done':
        return `${fmt(importable)} para importar · ${fmt(job.counters.invalid)} incorretos`;
      default:
        return `${fmt(job.counters.rows)} ${job.counters.rows === 1 ? 'linha verificada' : 'linhas verificadas'}`;
    }
  }

  percent(job: TrackedImport): number | null {
    if (job.phase === 'importing') {
      const importable = job.counters.new + job.counters.addToList;
      return importable ? Math.min(100, Math.round(((job.imported + job.skipped) / importable) * 100)) : 0;
    }
    return job.phase === 'validating' ? null : 100;
  }

  actionLabel(job: TrackedImport): string {
    if (job.phase === 'done') return 'Revisar e importar';
    if (job.phase === 'finished') return 'Ver contatos';
    return 'Abrir detalhes';
  }

  open(job: TrackedImport): void {
    if (job.phase === 'finished') {
      this.tracker.clear();
      this.router.navigate(['/contacts']);
      return;
    }
    this.router.navigate(['/contacts'], { queryParams: { importar: '1' } });
  }

  closable(job: TrackedImport): boolean {
    return job.phase === 'done' || job.phase === 'finished' || job.phase === 'failed';
  }

  /** Validação pendente só some descartando no servidor; senão voltaria a cada F5 por 48 horas. */
  async close(job: TrackedImport): Promise<void> {
    if (job.phase !== 'done') {
      this.tracker.clear();
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Descartar importação',
      message: `Descartar a validação de "${job.name}"?\n\nNada foi gravado ainda. Para importar depois, será preciso enviar o arquivo de novo.`,
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
    this.api.cancelImport(job.id).subscribe({
      next: () => this.tracker.clear(),
      error: (err) => this.toast.apiError(err),
    });
  }
}
