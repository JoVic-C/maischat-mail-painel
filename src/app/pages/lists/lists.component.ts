import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { List, SaveListInput } from '../../models';
import { ApiService } from '../../services/api.service';
import { ImportTrackerService } from '../../services/import-tracker.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-lists',
  templateUrl: './lists.component.html',
  styleUrls: ['./lists.component.scss'],
  standalone: false,
})
export class ListsComponent implements OnInit, OnDestroy {
  lists: List[] = [];
  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;
  resyncing = false;

  wizardStep: 1 | 2 = 1;
  createdList: List | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    description: 'Descrição',
    type: 'Tipo',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
  };

  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  private finishedSub?: Subscription;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private router: Router,
    private tracker: ImportTrackerService,
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
    // Importação minimizada que terminou: os contadores de contatos mudaram.
    this.finishedSub = this.tracker.finished$.subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.finishedSub?.unsubscribe();
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

  open(list: List): void {
    this.router.navigate(['/lists', list._id]);
  }

  openCreate(): void {
    this.createdList = null;
    this.wizardStep = 1;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: '', description: '', type: 'private' });
    this.modal = true;
  }

  closeWizard(): void {
    this.modal = false;
    this.wizardStep = 1;
    this.createdList = null;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }

    const payload: SaveListInput = { ...this.form.value };
    this.saving = true;
    this.formError = '';
    this.api.saveList(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.toast.success('Lista criada.');
        this.load();
        this.createdList = res.list;
        this.wizardStep = 2;
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

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
}
