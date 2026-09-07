import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Contact, ContactQuery, ContactStatus, DeliveryFilter, List, SaveContactInput } from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { baixarBlob } from '../../shared/download';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

const PAGE_SIZE = 50;

@Component({
    selector: 'app-contacts',
    templateUrl: './contacts.component.html',
    styleUrls: ['./contacts.component.scss'],
    standalone: false
})
export class ContactsComponent implements OnInit, OnDestroy {
  contacts: Contact[] = [];
  lists: List[] = [];
  total = 0;
  page = 1;
  limit = PAGE_SIZE;

  loading = false;
  error: string | null = null;

  search = '';
  listFilter = '';
  statusFilter: ContactStatus | '' = '';
  deliveryFilter: DeliveryFilter = '';

  selectedIds = new Set<string>();
  bulkDeleting = false;

  modal = false;
  saving = false;
  importModal = false;
  editingId: string | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  private readonly FIELD_LABELS: Record<string, string> = {
    email: 'Email',
    name: 'Nome',
    company: 'Empresa',
    phone: 'Telefone',
    lists: 'Listas',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    email: 'Informe um email válido.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }


  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      name: [''],
      company: [''],
      phone: [''],
      lists: [[] as string[]],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    this.load();
    this.api.getLists().subscribe({
      next: (lists) => (this.lists = lists),
      // A listagem de listas é acessória: falhar aqui não pode derrubar a tela.
      error: (err) => this.toast.apiError(err),
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    this.serverErrors.destroy();
  }

  get hasFilters(): boolean {
    return !!(this.search || this.listFilter || this.statusFilter || this.deliveryFilter);
  }

  get emptyText(): string {
    return this.hasFilters
      ? 'Nenhum contato encontrado com esses filtros.'
      : 'Nenhum contato ainda. Importe um CSV ou cadastre o primeiro!';
  }

  /**
   * O recorte que o usuário está vendo. Usado pela listagem E pela exportação — se
   * cada uma montasse o seu, o arquivo exportado poderia não bater com a tela.
   */
  private filtrosAtuais(): ContactQuery {
    return {
      search: this.search,
      listId: this.listFilter,
      status: this.statusFilter,
      delivery: this.deliveryFilter,
    };
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api
      .getContacts({ ...this.filtrosAtuais(), page: this.page, limit: this.limit })
      .subscribe({
        next: (res) => {
          this.contacts = res.contacts;
          this.total = res.total;
          this.page = res.page;
          this.limit = res.limit;
          this.loading = false;
          // Mantém selecionados apenas os que continuam visíveis nesta página.
          const visible = new Set(res.contacts.map((c) => c._id));
          this.selectedIds.forEach((id) => {
            if (!visible.has(id)) this.selectedIds.delete(id);
          });
        },
        error: (err) => {
          this.loading = false;
          this.error = apiErrorMessage(err);
        },
      });
  }

  /** Qualquer mudança de filtro volta para a primeira página. */
  reload(): void {
    this.page = 1;
    this.clearSelection();
    this.load();
  }

  goToPage(page: number): void {
    this.page = page;
    this.clearSelection();
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 300);
  }

  // ─── Seleção em lote ───

  get allSelected(): boolean {
    return this.contacts.length > 0 && this.contacts.every((c) => this.selectedIds.has(c._id));
  }

  get someSelected(): boolean {
    return this.selectedIds.size > 0 && !this.allSelected;
  }

  toggleAll(): void {
    if (this.allSelected) this.clearSelection();
    else this.contacts.forEach((c) => this.selectedIds.add(c._id));
  }

  toggleOne(contact: Contact): void {
    if (this.selectedIds.has(contact._id)) this.selectedIds.delete(contact._id);
    else this.selectedIds.add(contact._id);
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  bulkDelete(): void {
    const ids = [...this.selectedIds];
    if (!ids.length) return;
    this.confirm
      .ask({
        title: 'Excluir contatos',
        message: `Excluir ${ids.length} contato(s) selecionado(s)?\n\nEsta ação não pode ser desfeita.`,
        confirmLabel: `Excluir ${ids.length}`,
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.bulkDeleting = true;
        this.api.bulkDeleteContacts(ids).subscribe({
          next: (res) => {
            this.bulkDeleting = false;
            this.clearSelection();
            this.toast.success(res.message);
            this.load();
          },
          error: (err) => {
            this.bulkDeleting = false;
            this.toast.apiError(err);
          },
        });
      });
  }

  // ─── CRUD ───

  openCreate(): void {
    this.editingId = null;
    this.formError = '';
    this.serverErrors.clear();
    // Já vem vinculado à lista que está filtrada — é quase sempre o que se quer.
    this.form.reset({ email: '', name: '', company: '', phone: '', lists: this.listFilter ? [this.listFilter] : [] });
    this.modal = true;
  }

  openEdit(contact: Contact): void {
    this.editingId = contact._id;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({
      email: contact.email,
      name: contact.name,
      company: contact.company,
      phone: contact.phone,
      lists: [...contact.lists],
    });
    this.modal = true;
  }

  openImport(): void {
    this.importModal = true;
  }

  closeImport(): void {
    this.importModal = false;
  }

  exportando = false;

  /**
   * Exporta o que está na tela — com busca e filtros aplicados, não a base inteira.
   * É o mesmo recorte que o usuário está vendo, que é o que ele espera receber.
   */
  exportar(): void {
    this.exportando = true;
    this.api.exportContacts(this.filtrosAtuais()).subscribe({
      next: (blob) => {
        this.exportando = false;
        baixarBlob(blob, 'contatos.csv');
      },
      error: (err) => {
        this.exportando = false;
        this.toast.apiError(err);
      },
    });
  }

  onImported(): void {
    this.importModal = false;
    this.reload();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    const payload: SaveContactInput = { ...this.form.value };
    if (this.editingId) payload.id = this.editingId;

    this.saving = true;
    this.formError = '';
    this.api.saveContact(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.modal = false;
        this.toast.success(res.message);
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  reactivate(contact: Contact): void {
    this.confirm
      .ask({
        title: 'Reativar contato',
        message: `Reativar ${contact.email}?\n\nSó reative se o bloqueio foi engano ou teste. Reativar um endereço que realmente não existe (bounce real) prejudica sua reputação de envio.`,
        confirmLabel: 'Reativar',
      })
      .then((ok) => {
        if (!ok) return;
        this.api.reactivateContact(contact._id).subscribe({
          next: () => {
            this.toast.success('Contato reativado.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  remove(contact: Contact): void {
    this.confirm
      .ask({ title: 'Excluir contato', message: `Excluir ${contact.email}?`, confirmLabel: 'Excluir', danger: true })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteContact(contact._id).subscribe({
          next: () => {
            this.toast.success('Contato excluído.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  fmtDate(d: string): string {
    return new Date(d).toLocaleDateString('pt-BR');
  }

  deliveryHint(contact: Contact): string {
    return contact.lastDeliveredAt
      ? `Recebeu em ${this.fmtDate(contact.lastDeliveredAt)}`
      : 'Nunca recebeu um envio';
  }
}
