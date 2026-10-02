import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Contact, List, SaveListInput } from '../../models';
import { ApiService } from '../../services/api.service';
import { baixarBlob } from '../../shared/download';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-list-detail',
  templateUrl: './list-detail.component.html',
  styleUrls: ['./list-detail.component.scss'],
  standalone: false,
})
export class ListDetailComponent implements OnInit, OnDestroy {
  list: List | null = null;
  listLoading = true;
  listError: string | null = null;

  contacts: Contact[] = [];
  total = 0;
  page = 1;
  readonly limit = PAGE_SIZE;
  loading = false;
  error: string | null = null;
  search = '';

  exporting = false;

  editModal = false;
  saving = false;
  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  deleteModal = false;
  deleting = false;

  private listId = '';
  private routeSub?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;

  private readonly FIELD_LABELS: Record<string, string> = { name: 'Nome', description: 'Descrição', type: 'Tipo' };

  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
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
    this.routeSub = this.route.paramMap.subscribe((params) => {
      this.listId = params.get('id') ?? '';
      this.page = 1;
      this.search = '';
      this.loadList();
      this.loadContacts();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    clearTimeout(this.searchTimer);
    this.serverErrors.destroy();
  }

  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  get emptyText(): string {
    return this.search.trim()
      ? `Nenhum contato desta lista encontrado para "${this.search.trim()}".`
      : 'Esta lista ainda não tem contatos.';
  }

  loadList(): void {
    this.listLoading = true;
    this.listError = null;
    this.api.getList(this.listId).subscribe({
      next: (list) => {
        this.list = list;
        this.listLoading = false;
      },
      error: (err) => {
        this.listLoading = false;
        this.listError =
          err instanceof HttpErrorResponse && err.status === 404
            ? 'Esta lista não existe ou foi excluída.'
            : apiErrorMessage(err);
      },
    });
  }

  loadContacts(): void {
    this.loading = true;
    this.error = null;
    this.api
      .getContacts({ listId: this.listId, search: this.search.trim(), page: this.page, limit: this.limit })
      .subscribe({
        next: (res) => {
          this.contacts = res.contacts;
          this.total = res.total;
          this.page = res.page;
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err);
        },
      });
  }

  onSearch(value: string): void {
    this.search = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      this.loadContacts();
    }, 300);
  }

  goToPage(page: number): void {
    this.page = page;
    this.loadContacts();
  }

  openEdit(): void {
    if (!this.list) return;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: this.list.name, description: this.list.description, type: this.list.type });
    this.editModal = true;
  }

  save(): void {
    if (!this.list) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    const payload: SaveListInput = { ...this.form.value, id: this.list._id };
    this.saving = true;
    this.formError = '';
    this.api.saveList(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.editModal = false;
        this.list = res.list;
        this.toast.success('Lista atualizada.');
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  /** A lista inteira, sem a busca: é o que o botão promete. */
  exportar(): void {
    const list = this.list;
    if (!list) return;
    this.exporting = true;
    this.api.exportContacts({ listId: list._id }).subscribe({
      next: (blob) => {
        this.exporting = false;
        baixarBlob(blob, `contatos-${list.name}.csv`);
      },
      error: (err) => {
        this.exporting = false;
        this.toast.apiError(err);
      },
    });
  }

  confirmDelete(): void {
    const list = this.list;
    if (!list) return;
    this.deleting = true;
    this.api.deleteList(list._id).subscribe({
      next: () => {
        this.deleting = false;
        this.deleteModal = false;
        this.toast.success(`Lista "${list.name}" excluída.`);
        this.router.navigate(['/lists']);
      },
      error: (err) => {
        this.deleting = false;
        this.toast.apiError(err);
      },
    });
  }
}
