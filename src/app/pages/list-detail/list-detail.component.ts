import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Contact, List, ListVerification, SaveListInput, VerificationFilter, VerificationJobStatus } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { baixarBlob } from '../../shared/download';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

const PAGE_SIZE = 50;
/** O provedor leva minutos; consultar mais que isso só gasta a cota de requisições. */
const VERIFICATION_POLL_MS = 5000;
const RUNNING: VerificationJobStatus[] = ['queued', 'uploading', 'verifying', 'applying'];

const STEP_LABELS: Record<VerificationJobStatus, string> = {
  queued: 'Na fila para verificar…',
  uploading: 'Enviando a lista para o verificador…',
  verifying: 'Verificando as caixas postais',
  applying: 'Gravando os resultados nos contatos…',
  done: 'Verificação concluída',
  failed: 'A verificação falhou',
};

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
  verificationFilter: VerificationFilter = '';

  verification: ListVerification | null = null;
  verificationError: string | null = null;
  startingVerification = false;

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
  private verificationTimer?: ReturnType<typeof setTimeout>;
  private verificationSub?: Subscription;

  private readonly FIELD_LABELS: Record<string, string> = { name: 'Nome', description: 'Descrição', type: 'Tipo' };

  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private toast: ToastService,
    private confirm: ConfirmService,
    public auth: AuthService,
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
      this.verificationFilter = '';
      this.verification = null;
      this.loadList();
      this.loadContacts();
      this.loadVerification();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    clearTimeout(this.searchTimer);
    this.stopVerificationPolling();
    this.serverErrors.destroy();
  }

  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  get emptyText(): string {
    if (this.verificationFilter) return 'Nenhum contato desta lista com essa situação de verificação.';
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
      .getContacts({
        listId: this.listId,
        search: this.search.trim(),
        verification: this.verificationFilter,
        page: this.page,
        limit: this.limit,
      })
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

  onVerificationFilter(value: VerificationFilter): void {
    this.verificationFilter = value;
    this.page = 1;
    this.loadContacts();
  }

  get verificationRunning(): boolean {
    const status = this.verification?.job?.status;
    return !!status && RUNNING.includes(status);
  }

  get verificationStep(): string {
    const job = this.verification?.job;
    return job ? STEP_LABELS[job.status] : '';
  }

  /** Só a etapa do provedor tem percentual; as outras são curtas e ficam indeterminadas. */
  get verificationProgress(): number | null {
    const job = this.verification?.job;
    return job?.status === 'verifying' ? job.progress : null;
  }

  get quotaLeft(): number | null {
    const quota = this.verification?.quota;
    if (!quota?.limit) return null;
    return Math.max(0, quota.limit - quota.used);
  }

  /** Cota do mês não cobre a lista: o servidor recusaria, então o botão já explica. */
  get quotaShort(): boolean {
    const left = this.quotaLeft;
    return left !== null && !!this.verification && this.verification.pending > left;
  }

  loadVerification(): void {
    this.verificationSub?.unsubscribe();
    this.verificationSub = this.api.getListVerification(this.listId).subscribe({
      next: (overview) => {
        const wasRunning = this.verificationRunning;
        this.verification = overview;
        this.verificationError = null;
        if (this.verificationRunning) {
          this.scheduleVerificationPoll();
        } else if (wasRunning) {
          this.onVerificationFinished();
        }
      },
      error: (err) => {
        this.verificationError = apiErrorMessage(err);
        // Em andamento, uma falha de rede não encerra o acompanhamento.
        if (this.verificationRunning) this.scheduleVerificationPoll();
      },
    });
  }

  async startVerification(): Promise<void> {
    const overview = this.verification;
    if (!overview || !overview.pending || this.startingVerification) return;

    const quota = overview.quota.limit
      ? `\n\nCota do mês: ${overview.quota.used} de ${overview.quota.limit} verificações usadas.`
      : '';
    const ok = await this.confirm.ask({
      title: 'Verificar emails da lista',
      message:
        `${overview.pending} contato(s) ativo(s) sem verificação nos últimos ${overview.ttlDays} dias serão ` +
        'verificados na EmailListVerify. Cada verificação consome 1 crédito; as inconclusivas não são cobradas.' +
        '\n\nContatos reprovados deixam de receber campanhas.' +
        quota,
      confirmLabel: `Verificar ${overview.pending}`,
    });
    if (!ok) return;

    this.startingVerification = true;
    this.api.startListVerification(this.listId).subscribe({
      next: (res) => {
        this.startingVerification = false;
        this.verification = { ...overview, job: res.job };
        this.toast.info('Verificação iniciada. Você pode sair desta tela; ela continua no servidor.');
        this.scheduleVerificationPoll();
      },
      error: (err) => {
        this.startingVerification = false;
        this.toast.apiError(err);
        this.loadVerification();
      },
    });
  }

  private scheduleVerificationPoll(): void {
    clearTimeout(this.verificationTimer);
    this.verificationTimer = setTimeout(() => this.loadVerification(), VERIFICATION_POLL_MS);
  }

  private stopVerificationPolling(): void {
    clearTimeout(this.verificationTimer);
    this.verificationSub?.unsubscribe();
  }

  private onVerificationFinished(): void {
    const job = this.verification?.job;
    if (job?.status === 'done') {
      this.toast.success(
        job.counters.undeliverable
          ? `Verificação concluída: ${job.counters.undeliverable} contato(s) reprovado(s) deixam de receber campanhas.`
          : 'Verificação concluída: nenhum contato reprovado.'
      );
      this.loadContacts();
    } else if (job?.status === 'failed') {
      this.toast.error(job.error || 'A verificação falhou.');
    }
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
