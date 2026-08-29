import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SaveSmtpInput, SmtpCredentials, SmtpServer } from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { PromptService } from '../../shared/prompt/prompt.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
    selector: 'app-smtp',
    templateUrl: './smtp.component.html',
    styleUrls: ['./smtp.component.scss'],
    standalone: false
})
export class SmtpComponent implements OnInit, OnDestroy {
  servers: SmtpServer[] = [];
  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;
  testing = false;
  sendingTest = false;
  editingId: string | null = null;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    host: 'Host',
    port: 'Porta',
    user: 'Usuário',
    password: 'Senha',
    fromName: 'Nome do remetente',
    fromEmail: 'Email do remetente',
    dailyLimit: 'Limite diário',
    hourlyLimit: 'Limite por hora',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
    host: 'Informe o endereço do servidor (ex.: smtp.gmail.com).',
    port: 'Porta inválida — use um número entre 1 e 65535.',
    user: 'Informe o usuário de autenticação do SMTP.',
    password: 'Informe a senha ou app password.',
    fromName: 'Informe o nome que aparece como remetente.',
    fromEmail: 'Informe um email de remetente válido.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private prompt: PromptService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      host: ['', Validators.required],
      port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
      secure: [false],
      user: ['', Validators.required],
      password: [''],
      fromName: ['', Validators.required],
      fromEmail: ['', [Validators.required, Validators.email]],
      isDefault: [false],
      dailyLimit: [0, Validators.min(0)],
      hourlyLimit: [0, Validators.min(0)],
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
    this.api.getSmtp().subscribe({
      next: (servers) => {
        this.servers = servers;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  limitsLabel(server: SmtpServer): string {
    const parts: string[] = [];
    if (server.dailyLimit) parts.push(`${server.dailyLimit}/dia`);
    if (server.hourlyLimit) parts.push(`${server.hourlyLimit}/h`);
    return parts.length ? parts.join(' · ') : 'sem limite';
  }

  openCreate(): void {
    this.editingId = null;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({
      name: '',
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      fromName: '',
      fromEmail: '',
      isDefault: false,
      dailyLimit: 0,
      hourlyLimit: 0,
    });
    // Na criação a senha é obrigatória; na edição, opcional (vazio = manter a atual).
    this.form.controls['password'].setValidators([Validators.required]);
    this.form.controls['password'].updateValueAndValidity();
    this.modal = true;
  }

  openEdit(server: SmtpServer): void {
    this.editingId = server.id;
    this.formError = '';
    this.serverErrors.clear();
    // A senha nunca volta da API: fica vazia e o backend só a sobrescreve se for enviada.
    this.form.reset({
      name: server.name,
      host: server.host,
      port: server.port,
      secure: server.secure,
      user: server.user,
      password: '',
      fromName: server.fromName,
      fromEmail: server.fromEmail,
      isDefault: server.isDefault,
      dailyLimit: server.dailyLimit,
      hourlyLimit: server.hourlyLimit,
    });
    this.form.controls['password'].clearValidators();
    this.form.controls['password'].updateValueAndValidity();
    this.modal = true;
  }

  /** Testar exige as credenciais completas — inclusive a senha, que a API nunca devolve. */
  get canTest(): boolean {
    const v = this.form.value;
    return !!(v.host && v.port && v.user && v.password);
  }

  private creds(): SmtpCredentials {
    const v = this.form.value;
    return {
      host: String(v.host || ''),
      port: Number(v.port),
      secure: !!v.secure,
      user: String(v.user || ''),
      password: String(v.password || ''),
    };
  }

  test(): void {
    this.testing = true;
    this.api.testSmtp(this.creds()).subscribe({
      next: (res) => {
        this.testing = false;
        this.toast.success(res.message || 'Conexão OK!');
      },
      error: (err) => {
        this.testing = false;
        this.toast.apiError(err);
      },
    });
  }

  sendTestEmail(): void {
    this.prompt
      .ask({
        title: 'Enviar email de teste',
        message: 'Usa as credenciais preenchidas neste formulário, sem precisar salvar antes.',
        label: 'Destinatário',
        type: 'email',
        placeholder: 'voce@empresa.com',
        confirmLabel: 'Enviar',
      })
      .then((to) => {
        if (!to) return;
        this.sendingTest = true;
        const v = this.form.value;
        const from = `"${v.fromName || 'mMail'}" <${v.fromEmail || v.user}>`;
        this.api.sendSmtpTestEmail(this.creds(), from, to).subscribe({
          next: (res) => {
            this.sendingTest = false;
            this.toast.success(res.message);
          },
          error: (err) => {
            this.sendingTest = false;
            this.toast.apiError(err);
          },
        });
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }

    const v = this.form.value;
    const payload: SaveSmtpInput = {
      ...v,
      port: Number(v.port),
      dailyLimit: Number(v.dailyLimit ?? 0),
      hourlyLimit: Number(v.hourlyLimit ?? 0),
    };
    if (this.editingId) payload.id = this.editingId;
    // Edição sem senha nova: não envia o campo, senão o backend gravaria vazio.
    if (payload.id && !payload.password) delete payload.password;

    this.saving = true;
    this.formError = '';
    this.api.saveSmtp(payload).subscribe({
      next: () => {
        this.saving = false;
        this.modal = false;
        this.toast.success('Servidor salvo.');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  remove(server: SmtpServer): void {
    this.confirm
      .ask({
        title: 'Excluir servidor',
        message: `Excluir o servidor "${server.name}"?\n\nCampanhas que apontam para ele voltarão a usar o servidor padrão.`,
        confirmLabel: 'Excluir',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteSmtp(server.id).subscribe({
          next: () => {
            this.toast.success('Servidor excluído.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }
}
