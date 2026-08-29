import { Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InvalidRow, List, RowKind, ValidatedRow } from '../../models';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../toast/toast.service';

interface LiveRow {
  email: string;
  kind: RowKind;
  reason?: string;
}

/**
 * Importador de contatos reutilizável: valida um CSV ao vivo (SSE) e importa os corretos.
 * Usado tanto na tela de Contatos quanto no passo 2 de "Nova lista".
 *
 * - Sem `fixedListId`: mostra o seletor de lista de destino.
 * - Com `fixedListId`: destino travado nessa lista (esconde o seletor).
 */
@Component({
    selector: 'app-csv-import',
    templateUrl: './csv-import.component.html',
    styleUrls: ['./csv-import.component.scss'],
    standalone: false
})
export class CsvImportComponent implements OnInit, OnDestroy {
  /** Listas disponíveis para o seletor de destino (ignorado quando fixedListId está setado). */
  @Input() lists: List[] = [];
  /** Quando setado, o destino fica travado nessa lista e o seletor some. */
  @Input() fixedListId: string | null = null;
  /** Texto do botão de fechar/cancelar (fase inicial). */
  @Input() cancelLabel = 'Cancelar';
  /** Texto do botão de fechar (fase final). */
  @Input() doneCancelLabel = 'Fechar';

  /** Emitido após importar com sucesso. */
  @Output() finished = new EventEmitter<{ imported: number }>();
  /** Emitido quando o usuário cancela/fecha. */
  @Output() cancel = new EventEmitter<void>();

  form: FormGroup;
  phase: 'form' | 'validating' | 'done' = 'form';

  streamTotal = 0;
  streamProcessed = 0;
  streamNew = 0;
  streamAdd = 0;
  streamInList = 0;
  streamAlready = 0;
  streamInvalid = 0;

  visibleRows: LiveRow[] = [];
  validRows: ValidatedRow[] = [];
  invalidRows: InvalidRow[] = [];

  importingValid = false;
  downloading = false;
  validatedListId = '';

  private abortCtrl?: AbortController;
  private readonly LIVE_LIMIT = 120;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private zone: NgZone,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      csv: ['', Validators.required],
      listId: [''],
    });
  }

  ngOnInit(): void {
    if (this.fixedListId) this.form.patchValue({ listId: this.fixedListId });
  }

  ngOnDestroy(): void {
    this.abortCtrl?.abort();
  }

  get importListId(): string {
    return String(this.form.value.listId || '');
  }

  get progressPct(): number {
    return this.streamTotal ? Math.round((this.streamProcessed / this.streamTotal) * 100) : 0;
  }

  get importableCount(): number {
    return this.streamNew + this.streamAdd;
  }

  get listChanged(): boolean {
    return this.importListId !== this.validatedListId;
  }

  /**
   * Trocar a lista de destino muda a classificação de quem já existe na base
   * ("já na lista" vs "+ à lista"), então o resultado anterior deixa de valer.
   */
  get needsRevalidate(): boolean {
    return this.listChanged && this.streamAdd + this.streamInList + this.streamAlready > 0;
  }

  private reset(): void {
    this.phase = 'form';
    this.streamTotal = 0;
    this.streamProcessed = 0;
    this.streamNew = 0;
    this.streamAdd = 0;
    this.streamInList = 0;
    this.streamAlready = 0;
    this.streamInvalid = 0;
    this.visibleRows = [];
    this.validRows = [];
    this.invalidRows = [];
    this.importingValid = false;
    this.validatedListId = '';
  }

  startValidation(): void {
    const csv = String(this.form.value.csv || '');
    const listId = this.importListId;
    if (!csv.trim()) return;

    this.reset();
    this.phase = 'validating';
    this.abortCtrl = new AbortController();
    this.validatedListId = listId;
    const listIds = listId ? [listId] : [];

    this.api.validateCsvStream(
      csv,
      listIds,
      {
        start: (total) =>
          this.zone.run(() => {
            this.streamTotal = total;
          }),
        row: (r) =>
          this.zone.run(() => {
            this.streamProcessed++;
            switch (r.kind) {
              case 'new':
                this.streamNew++;
                this.validRows.push({
                  email: r.email,
                  name: r.name,
                  phone: r.phone,
                  company: r.company,
                  metadata: r.metadata,
                });
                break;
              case 'add-to-list':
                this.streamAdd++;
                this.validRows.push({
                  email: r.email,
                  name: r.name,
                  phone: r.phone,
                  company: r.company,
                  metadata: r.metadata,
                });
                break;
              case 'in-list':
                this.streamInList++;
                break;
              case 'already':
                this.streamAlready++;
                break;
              default:
                this.streamInvalid++;
                this.invalidRows.push({ email: r.email, name: r.name, reason: r.reason });
            }
            this.visibleRows.push({ email: r.email, kind: r.kind, reason: r.reason });
            if (this.visibleRows.length > this.LIVE_LIMIT) this.visibleRows.shift();
          }),
        done: () =>
          this.zone.run(() => {
            this.phase = 'done';
          }),
        error: (msg) =>
          this.zone.run(() => {
            this.phase = 'form';
            this.toast.error(msg);
          }),
      },
      this.abortCtrl.signal
    );
  }

  cancelValidation(): void {
    this.abortCtrl?.abort();
    this.phase = 'form';
  }

  importValid(): void {
    if (!this.validRows.length) return;
    this.importingValid = true;
    const listIds = this.importListId ? [this.importListId] : [];
    this.api.importValidated(this.validRows, listIds).subscribe({
      next: (res) => {
        this.importingValid = false;
        this.toast.success(res.message);
        this.finished.emit({ imported: res.imported ?? 0 });
      },
      error: (err) => {
        this.importingValid = false;
        this.toast.apiError(err);
      },
    });
  }

  downloadInvalid(): void {
    this.downloading = true;
    this.api.exportInvalidContacts(this.invalidRows).subscribe({
      next: (blob) => {
        this.downloading = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contatos-incorretos.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.downloading = false;
        this.toast.apiError(err);
      },
    });
  }

  /** O rótulo do badge vem de CSV_ROW_LABELS; o motivo da recusa entra como tooltip. */
  rowHint(row: LiveRow): string {
    return row.reason ?? '';
  }
}
