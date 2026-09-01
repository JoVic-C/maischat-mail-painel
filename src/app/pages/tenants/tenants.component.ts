import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CreateTenantInput, PlatformSettings, TenantSummary, TenantWelcome } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { PromptService } from '../../shared/prompt/prompt.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

/** Mesmo formato exigido pelo backend: 3–40 caracteres, minúsculas, números e hífen. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

@Component({
    selector: 'app-tenants',
    templateUrl: './tenants.component.html',
    styleUrls: ['./tenants.component.scss'],
    standalone: false
})
export class TenantsComponent implements OnInit, OnDestroy {
  tenants: TenantSummary[] = [];
  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome do cliente',
    slug: 'Identificador',
    adminEmail: 'Email do administrador',
    adminName: 'Nome do administrador',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
    slug: '3 a 40 caracteres: letras minúsculas, números e hífen.',
    adminEmail: 'Informe um email válido.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private prompt: PromptService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      slug: ['', [Validators.required, Validators.pattern(SLUG_PATTERN)]],
      adminName: [''],
      adminEmail: ['', [Validators.required, Validators.email]],
    });
    this.limitsForm = this.fb.group({
      concurrency: [0, [Validators.required, Validators.min(0)]],
      ratePerMinute: [0, [Validators.required, Validators.min(0)]],
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
    this.api.getTenants().subscribe({
      next: (tenants) => {
        this.tenants = tenants;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  /**
   * Link de acesso do cliente recém-criado. Mostrado sempre: confirma para onde o
   * email foi e serve de plano B quando a entrega falha.
   */
  welcome: TenantWelcome | null = null;
  welcomeFor = '';
  linkCopied = false;

  /** Copia o link para a área de transferência, com retorno visual. */
  async copyWelcomeLink(): Promise<void> {
    if (!this.welcome) return;
    try {
      await navigator.clipboard.writeText(this.welcome.url);
      this.linkCopied = true;
      setTimeout(() => (this.linkCopied = false), 2200);
    } catch {
      this.toast.error('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  openCreate(): void {
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: '', slug: '', adminName: '', adminEmail: '' });
    this.modal = true;
  }

  /** Deriva o identificador a partir do nome, respeitando o formato exigido pela API. */
  suggestSlug(): void {
    const slug = String(this.form.value.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // tira acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    this.form.patchValue({ slug });
  }

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    this.saving = true;
    this.formError = '';
    this.api.createTenant(this.form.value as CreateTenantInput).subscribe({
      next: (res) => {
        this.saving = false;
        this.modal = false;
        this.toast.success(res.message);
        // O email é best-effort. O link fica à mão para o superadmin repassar por
        // outro canal caso a entrega falhe (plataforma ainda sem SMTP, caixa recusando).
        this.welcome = res.tenant?.welcome ?? null;
        this.welcomeFor = res.tenant?.adminEmail ?? '';
        this.linkCopied = false;
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  /** Passa a operar o painel dentro deste cliente (header X-Tenant-Id). */
  operate(tenant: TenantSummary): void {
    this.auth.setActiveTenant(tenant.id, tenant.name);
    this.toast.success(`Operando em "${tenant.name}".`);
    this.router.navigate(['/dashboard']);
  }

  // ─── Limites de envio do cliente ───

  /** Cliente cujos limites estão sendo editados; null quando o modal está fechado. */
  limitsFor: TenantSummary | null = null;
  limitsForm: FormGroup;
  savingLimits = false;
  limitsError = '';
  /** Teto da plataforma — os limites do cliente são fatias dele, não capacidade extra. */
  engine: PlatformSettings | null = null;

  openLimits(tenant: TenantSummary): void {
    this.limitsFor = tenant;
    this.limitsError = '';
    this.limitsForm.reset({
      concurrency: tenant.sendingLimits?.concurrency ?? 0,
      ratePerMinute: tenant.sendingLimits?.ratePerMinute ?? 0,
    });
    // Carrega o teto atual para mostrar "de N" ao lado de cada campo.
    if (!this.engine) {
      this.api.getPlatformSettings().subscribe({ next: (e) => (this.engine = e) });
    }
  }

  saveLimits(): void {
    if (!this.limitsFor || this.limitsForm.invalid) {
      this.limitsForm.markAllAsTouched();
      return;
    }
    this.savingLimits = true;
    this.limitsError = '';
    const { concurrency, ratePerMinute } = this.limitsForm.value;

    this.api.updateTenant(this.limitsFor.id, { sendingLimits: { concurrency, ratePerMinute } }).subscribe({
      next: (res) => {
        this.savingLimits = false;
        this.limitsFor = null;
        this.toast.success(res.message);
        this.load();
      },
      error: (err) => {
        this.savingLimits = false;
        this.limitsError = apiErrorMessage(err);
      },
    });
  }

  rename(tenant: TenantSummary): void {
    this.prompt
      .ask({ title: 'Renomear cliente', label: 'Novo nome', initialValue: tenant.name, confirmLabel: 'Salvar' })
      .then((name) => {
        if (!name || name === tenant.name) return;
        this.api.updateTenant(tenant.id, { name }).subscribe({
          next: (res) => {
            this.toast.success(res.message);
            if (tenant.id === this.auth.activeTenantId) this.auth.setActiveTenant(tenant.id, name);
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  toggleActive(tenant: TenantSummary): void {
    const activating = !tenant.isActive;
    this.confirm
      .ask({
        title: activating ? 'Reativar cliente' : 'Desativar cliente',
        message: activating
          ? `Reativar "${tenant.name}"? Os usuários voltam a conseguir entrar.`
          : `Desativar "${tenant.name}"?\n\nTodos os usuários deste cliente perdem o acesso imediatamente. Os dados são preservados.`,
        confirmLabel: activating ? 'Reativar' : 'Desativar',
        danger: !activating,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.updateTenant(tenant.id, { isActive: activating }).subscribe({
          next: (res) => {
            this.toast.success(res.message);
            // Desativou o cliente em que estava operando: sai do contexto.
            if (!activating && tenant.id === this.auth.activeTenantId) this.auth.setActiveTenant(null);
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  remove(tenant: TenantSummary): void {
    // Exclusão destrutiva: exige digitar o identificador, igual ao que a API pede.
    this.prompt
      .ask({
        title: 'Excluir cliente',
        message: `Isto apaga PERMANENTEMENTE o cliente "${tenant.name}" e todos os seus dados: ${tenant.users} usuário(s), ${tenant.contacts} contato(s), ${tenant.lists} lista(s) e ${tenant.campaigns} campanha(s).\n\nPara confirmar, digite o identificador do cliente.`,
        label: `Digite "${tenant.slug}"`,
        placeholder: tenant.slug,
        confirmLabel: 'Excluir definitivamente',
      })
      .then((confirmSlug) => {
        if (!confirmSlug) return;
        if (confirmSlug !== tenant.slug) {
          this.toast.warn('O identificador não confere. Nada foi excluído.');
          return;
        }
        this.api.deleteTenant(tenant.id, confirmSlug).subscribe({
          next: (res) => {
            this.toast.success(res.message);
            if (tenant.id === this.auth.activeTenantId) this.auth.setActiveTenant(null);
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }
}
