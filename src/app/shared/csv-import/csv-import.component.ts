import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subscription, switchMap, timer } from 'rxjs';
import { ImportCounters, ImportJob, ImportSampleRow, List } from '../../models';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../toast/toast.service';

/** Backoff do polling: a cota da API (200 req/15 min por IP) acabava com intervalo fixo. */
const POLL_INICIAL_MS = 1200;

const POLL_MAX_MS = 10_000;

const POLL_FATOR = 1.6;

function emptyCounters(): ImportCounters {
  return { rows: 0, new: 0, addToList: 0, inList: 0, already: 0, invalid: 0 };
}

/** O arquivo é processado por um worker no servidor; esta tela só acompanha contadores. */
@Component({
  selector: 'app-csv-import',
  templateUrl: './csv-import.component.html',
  styleUrls: ['./csv-import.component.scss'],
  standalone: false,
})
export class CsvImportComponent implements OnInit, OnDestroy {
  @Input() lists: List[] = [];
  /** Quando setado, o destino fica travado nessa lista e o seletor some. */
  @Input() fixedListId: string | null = null;
  @Input() cancelLabel = 'Cancelar';
  @Input() doneCancelLabel = 'Fechar';

  @Output() finished = new EventEmitter<{ imported: number }>();
  @Output() cancel = new EventEmitter<void>();

  form: FormGroup;
  /**
   * form       → escolhendo arquivo/colando
   * validating → worker classificando as linhas
   * done       → validado, esperando a confirmação
   * importing  → worker gravando no banco
   * finished   → concluído
   */
  phase: 'form' | 'validating' | 'done' | 'importing' | 'finished' = 'form';

  jobId = '';
  jobName = '';
  counters: ImportCounters = emptyCounters();
  sample: ImportSampleRow[] = [];
  imported = 0;
  skipped = 0;

  file: File | null = null;
  uploading = false;
  downloading = false;
  /** Lista com que a validação foi feita — trocar de lista invalida o resultado. */
  validatedListId = '';

  private poll?: Subscription;
  /** Impede reagendar depois que o job terminou. */
  private pollAtivo = false;
  private intervaloPoll = POLL_INICIAL_MS;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({ csv: [''], listId: [''] });
  }

  ngOnInit(): void {
    if (this.fixedListId) this.form.patchValue({ listId: this.fixedListId });
    this.resumeOpenImport();
  }

  ngOnDestroy(): void {
    // Só para de acompanhar; o job continua no servidor.
    this.stopPolling();
  }

  get importListId(): string {
    return String(this.form.value.listId || '');
  }

  get listIds(): string[] {
    return this.importListId ? [this.importListId] : [];
  }

  get importableCount(): number {
    return this.counters.new + this.counters.addToList;
  }

  get ignoredCount(): number {
    return this.counters.inList + this.counters.already;
  }

  get busy(): boolean {
    return this.phase === 'validating' || this.phase === 'importing';
  }

  get sourceLabel(): string {
    if (this.file) return this.file.name;
    return this.form.value.csv ? 'Conteúdo colado' : '';
  }

  get canSubmit(): boolean {
    return !this.uploading && (!!this.file || !!String(this.form.value.csv || '').trim());
  }

  /** A lista de destino muda a classificação ("já na lista" vs "+ à lista"). */
  get needsRevalidate(): boolean {
    return (
      this.phase === 'done' &&
      this.importListId !== this.validatedListId &&
      this.counters.addToList + this.counters.inList + this.counters.already > 0
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    // Escolher arquivo limpa o texto colado, e vice-versa.
    if (this.file) this.form.patchValue({ csv: '' });
  }

  startValidation(): void {
    const pasted = String(this.form.value.csv || '').trim();
    if (!this.file && !pasted) return;

    // Colado vira arquivo: texto dentro de JSON estoura o limite de corpo.
    const blob = this.file ?? new Blob([pasted], { type: 'text/csv' });
    const filename = this.file?.name ?? 'contatos-colados.csv';

    this.uploading = true;
    this.resetProgress();
    this.validatedListId = this.importListId;

    this.api.startImport(blob, filename, this.listIds).subscribe({
      next: (res) => {
        this.uploading = false;
        this.jobId = res.id;
        this.jobName = filename;
        this.phase = 'validating';
        this.startPolling();
      },
      error: (err) => {
        this.uploading = false;
        this.toast.apiError(err);
      },
    });
  }

  confirmImport(): void {
    if (!this.jobId || !this.importableCount) return;
    this.phase = 'importing';
    this.api.confirmImport(this.jobId, this.listIds).subscribe({
      next: () => this.startPolling(),
      error: (err) => {
        this.phase = 'done';
        this.toast.apiError(err);
      },
    });
  }

  cancelJob(): void {
    if (!this.jobId) {
      this.phase = 'form';
      return;
    }
    this.api.cancelImport(this.jobId).subscribe({
      next: () => {
        this.stopPolling();
        this.resetProgress();
        this.phase = 'form';
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  revalidate(): void {
    this.stopPolling();
    this.resetProgress();
    this.phase = 'form';
  }

  downloadInvalid(): void {
    if (!this.jobId) return;
    this.downloading = true;
    this.api.downloadImportInvalid(this.jobId).subscribe({
      next: (blob) => {
        this.downloading = false;
        // Acima de 20 mil recusados o servidor devolve CSV em vez de xlsx.
        const isCsv = blob.type.includes('csv') || blob.type.includes('text');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contatos-incorretos.${isCsv ? 'csv' : 'xlsx'}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.downloading = false;
        this.toast.apiError(err);
      },
    });
  }

  rowHint(row: ImportSampleRow): string {
    return row.reason ?? '';
  }

  /** Retoma uma importação deixada em aberto (modal fechado, página recarregada). */
  private resumeOpenImport(): void {
    this.api.getOpenImports().subscribe({
      next: (open) => {
        // Destino travado não retoma: o job mais recente pode ser de outra lista.
        const job = this.fixedListId ? undefined : open[0];
        if (!job || this.jobId) return;
        this.jobId = job.id;
        this.jobName = job.originalName;
        this.phase = job.status === 'importing' ? 'importing' : 'validating';
        this.startPolling();
      },
      // Falhar aqui não impede começar uma importação nova: segue em silêncio.
      error: () => undefined,
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollAtivo = true;
    this.intervaloPoll = POLL_INICIAL_MS;
    this.consultarProgresso(0);
  }

  private consultarProgresso(atraso: number): void {
    this.poll = timer(atraso)
      .pipe(switchMap(() => this.api.getImport(this.jobId)))
      .subscribe({
        next: (job) => {
          this.applyJob(job);
          // applyJob encerra o acompanhamento quando o job chega ao fim.
          if (!this.pollAtivo) return;
          // Agenda antes de crescer, para a primeira espera ser POLL_INICIAL_MS.
          const proxima = this.intervaloPoll;
          this.intervaloPoll = Math.min(this.intervaloPoll * POLL_FATOR, POLL_MAX_MS);
          this.consultarProgresso(proxima);
        },
        error: (err) => {
          this.stopPolling();
          this.toast.apiError(err);
        },
      });
  }

  private stopPolling(): void {
    this.pollAtivo = false;
    this.poll?.unsubscribe();
    this.poll = undefined;
  }

  private applyJob(job: ImportJob): void {
    this.counters = job.counters ?? emptyCounters();
    this.sample = job.sample ?? [];
    this.imported = job.imported ?? 0;
    this.skipped = job.skipped ?? 0;
    if (job.originalName) this.jobName = job.originalName;
    // Vale a lista do servidor, inclusive ao retomar um job iniciado em outra aba.
    this.validatedListId = job.listIds?.[0] ?? '';
    if (!this.fixedListId && this.busy) this.form.patchValue({ listId: this.validatedListId }, { emitEvent: false });

    switch (job.status) {
      case 'validated':
        this.stopPolling();
        this.phase = 'done';
        break;
      case 'done':
        this.stopPolling();
        this.phase = 'finished';
        this.toast.success(`${this.imported} contato(s) importado(s).`);
        this.finished.emit({ imported: this.imported });
        break;
      case 'failed':
        this.stopPolling();
        this.phase = 'form';
        this.toast.error(job.error || 'Falha ao processar a importação.');
        break;
      case 'canceled':
        this.stopPolling();
        this.phase = 'form';
        break;
      case 'importing':
        this.phase = 'importing';
        break;
      default:
        this.phase = 'validating';
    }
  }

  private resetProgress(): void {
    this.jobId = '';
    this.jobName = '';
    this.counters = emptyCounters();
    this.sample = [];
    this.imported = 0;
    this.skipped = 0;
  }
}
