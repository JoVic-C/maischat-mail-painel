import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ImportCounters, ImportSampleRow, List } from '../../models';
import { ApiService } from '../../services/api.service';
import { emptyCounters, ImportTrackerService, TrackedImport } from '../../services/import-tracker.service';
import { ToastService } from '../toast/toast.service';

/** O arquivo é processado por um worker no servidor; esta tela mostra o que o acompanhamento global recebe. */
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
  /** Fecha a janela e deixa o progresso no canto da tela. */
  @Output() minimize = new EventEmitter<void>();

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
  reconnecting = false;

  file: File | null = null;
  uploading = false;
  downloading = false;
  /** Lista com que a validação foi feita — trocar de lista invalida o resultado. */
  validatedListId = '';

  private stateSub?: Subscription;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private tracker: ImportTrackerService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({ csv: [''], listId: [''] });
  }

  ngOnInit(): void {
    if (this.fixedListId) this.form.patchValue({ listId: this.fixedListId });
    this.tracker.attach();
    this.stateSub = this.tracker.state$.subscribe((state) => this.applyState(state));
    // Destino travado não retoma: o job mais recente pode ser de outra lista.
    if (!this.tracker.current && !this.fixedListId) this.tracker.resumeOpen();
  }

  ngOnDestroy(): void {
    // Só deixa de mostrar; o acompanhamento continua no cartão do canto.
    this.stateSub?.unsubscribe();
    this.tracker.detach();
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

  get processedCount(): number {
    return this.imported + this.skipped;
  }

  /** Na gravação o total é conhecido; na validação não, e a barra fica indeterminada. */
  get importPercent(): number {
    if (!this.importableCount) return 0;
    return Math.min(100, Math.round((this.processedCount / this.importableCount) * 100));
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
    this.validatedListId = this.importListId;

    this.api.startImport(blob, filename, this.listIds).subscribe({
      next: (res) => {
        this.uploading = false;
        this.tracker.track(res.id, filename);
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
      next: () => this.tracker.continueAs('importing'),
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
      next: () => this.tracker.clear(),
      error: (err) => this.toast.apiError(err),
    });
  }

  /** A validação antiga é descartada no servidor, senão voltaria a ser retomada depois. */
  revalidate(): void {
    const staleId = this.jobId;
    if (staleId) this.api.cancelImport(staleId).subscribe({ error: () => undefined });
    this.tracker.clear();
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

  private applyState(state: TrackedImport | null): void {
    if (!state) {
      if (this.phase !== 'form') this.resetProgress();
      this.phase = 'form';
      return;
    }
    // O wizard de uma lista nova não assume a importação de outra lista.
    if (this.fixedListId && state.listIds.length && !state.listIds.includes(this.fixedListId)) return;

    this.jobId = state.id;
    this.jobName = state.name;
    this.counters = state.counters;
    this.sample = state.sample;
    this.imported = state.imported;
    this.skipped = state.skipped;
    this.reconnecting = state.reconnecting;
    if (state.listIds.length) this.validatedListId = state.listIds[0];

    switch (state.phase) {
      case 'validating':
      case 'importing':
        this.phase = state.phase;
        if (!this.fixedListId) this.form.patchValue({ listId: this.validatedListId }, { emitEvent: false });
        break;
      case 'done':
        if (this.phase !== 'done' && !this.fixedListId) {
          this.form.patchValue({ listId: this.validatedListId }, { emitEvent: false });
        }
        this.phase = 'done';
        break;
      case 'finished':
        this.phase = 'finished';
        this.finished.emit({ imported: state.imported });
        // Fora da notificação atual, para os outros ouvintes não receberem um estado velho.
        queueMicrotask(() => this.tracker.clear());
        break;
      case 'failed':
        queueMicrotask(() => this.tracker.clear());
        break;
    }
  }

  private resetProgress(): void {
    this.jobId = '';
    this.jobName = '';
    this.counters = emptyCounters();
    this.sample = [];
    this.imported = 0;
    this.skipped = 0;
    this.reconnecting = false;
  }
}
