import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SaveSegmentInput, SEGMENT_FIELD_LABELS, Segment } from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
    selector: 'app-segments',
    templateUrl: './segments.component.html',
    styleUrls: ['./segments.component.scss'],
    standalone: false
})
export class SegmentsComponent implements OnInit, OnDestroy {
  segments: Segment[] = [];
  counts: Record<string, number> = {};

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  counting: string | null = null;

  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;
  editingId: string | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  /** Campos disponíveis para as regras — mesma whitelist do backend. */
  fieldOptions = Object.entries(SEGMENT_FIELD_LABELS).map(([value, label]) => ({ value, label }));

  private readonly FIELD_LABELS: Record<string, string> = { name: 'Nome', rules: 'Regras' };

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      matchAll: [true],
      rules: this.fb.array([this.newRule()]),
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  get rules(): FormArray {
    return this.form.get('rules') as FormArray;
  }

  private newRule(field = 'company', operator = 'contains', value = ''): FormGroup {
    return this.fb.group({
      field: [field, Validators.required],
      operator: [operator, Validators.required],
      value: [value, Validators.required],
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.counts = {};
    this.api.getSegments().subscribe({
      next: (segments) => {
        this.segments = segments;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  fieldLabel(field: string): string {
    return SEGMENT_FIELD_LABELS[field] ?? field;
  }

  /** Resumo textual das regras, mostrado na coluna da tabela. */
  ruleSummary(segment: Segment): string {
    if (!segment.rules.length) return '—';
    return segment.rules
      .map((r) => `${this.fieldLabel(r.field)} ${r.operator === 'contains' ? 'contém' : '='} "${r.value}"`)
      .join(', ');
  }

  openCreate(): void {
    this.editingId = null;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: '', matchAll: true });
    this.rules.clear();
    this.rules.push(this.newRule());
    this.modal = true;
  }

  openEdit(segment: Segment): void {
    this.editingId = segment._id;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: segment.name, matchAll: segment.matchAll });
    this.rules.clear();
    if (segment.rules.length) {
      segment.rules.forEach((r) => this.rules.push(this.newRule(r.field, r.operator, r.value)));
    } else {
      this.rules.push(this.newRule());
    }
    this.modal = true;
  }

  addRule(): void {
    this.rules.push(this.newRule());
  }

  removeRule(i: number): void {
    this.rules.removeAt(i);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    const payload: SaveSegmentInput = { ...this.form.value };
    if (this.editingId) payload.id = this.editingId;

    this.saving = true;
    this.formError = '';
    this.api.saveSegment(payload).subscribe({
      next: () => {
        this.saving = false;
        this.modal = false;
        this.toast.success('Segmento salvo.');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  preview(segment: Segment): void {
    this.counting = segment._id;
    this.api.previewSegment(segment._id).subscribe({
      next: (res) => {
        this.counting = null;
        this.counts[segment._id] = res.count;
      },
      error: (err) => {
        this.counting = null;
        this.toast.apiError(err);
      },
    });
  }

  remove(segment: Segment): void {
    this.confirm
      .ask({
        title: 'Excluir segmento',
        message: `Excluir o segmento "${segment.name}"?`,
        confirmLabel: 'Excluir',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteSegment(segment._id).subscribe({
          next: () => {
            this.toast.success('Segmento excluído.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }
}
