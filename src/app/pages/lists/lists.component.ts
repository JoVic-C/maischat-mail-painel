import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { List, SaveListInput } from '../../models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
    selector: 'app-lists',
    templateUrl: './lists.component.html',
    styleUrls: ['./lists.component.scss'],
    standalone: false
})
export class ListsComponent implements OnInit, OnDestroy {
  lists: List[] = [];
  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;
  resyncing = false;
  deleteTarget: List | null = null;
  deleting = false;

  wizardStep: 1 | 2 = 1;
  createdList: List | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;
  editingId: string | null = null;

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    description: 'Descrição',
    type: 'Tipo',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      type: ['private'],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getLists().subscribe({
      next: (lists) => {
        this.lists = lists;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.createdList = null;
    this.wizardStep = 1;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: '', description: '', type: 'private' });
    this.modal = true;
  }

  openEdit(list: List): void {
    this.editingId = list._id;
    this.createdList = null;
    this.wizardStep = 1;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: list.name, description: list.description, type: list.type });
    this.modal = true;
  }

  closeWizard(): void {
    this.modal = false;
    this.wizardStep = 1;
    this.createdList = null;
    this.editingId = null;
  }

  /** Cria (e avança para o import) ou salva a edição. */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }

    const editing = !!this.editingId;
    const payload: SaveListInput = { ...this.form.value };
    if (this.editingId) payload.id = this.editingId;

    this.saving = true;
    this.formError = '';
    this.api.saveList(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.toast.success(editing ? 'Lista atualizada.' : 'Lista criada.');
        this.load();
        if (editing) {
          this.closeWizard();
        } else {
          this.createdList = res.list;
          this.wizardStep = 2;
        }
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  /** Passo 2 concluído (importou ou pulou) → fecha e atualiza contadores. */
  finishWizard(): void {
    this.closeWizard();
    this.load();
  }

  resync(): void {
    this.resyncing = true;
    this.api.resyncListCounts().subscribe({
      next: (res) => {
        this.resyncing = false;
        this.toast.success(res.message);
        this.load();
      },
      error: (err) => {
        this.resyncing = false;
        this.toast.apiError(err);
      },
    });
  }

  askDelete(list: List): void {
    this.deleteTarget = list;
  }

  confirmDelete(): void {
    const target = this.deleteTarget;
    if (!target) return;
    this.deleting = true;
    this.api.deleteList(target._id).subscribe({
      next: () => {
        this.deleting = false;
        this.deleteTarget = null;
        this.toast.success(`Lista "${target.name}" excluída.`);
        this.load();
      },
      error: (err) => {
        this.deleting = false;
        this.toast.apiError(err);
      },
    });
  }

}
