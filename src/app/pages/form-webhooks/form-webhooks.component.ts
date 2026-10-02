import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  FormSubmission,
  FormSubmissionStatus,
  FormWebhook,
  SaveFormWebhookInput,
  SmtpServer,
  Template,
} from '../../models';
import { ApiService } from '../../services/api.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

type GuideTab = 'html' | 'js' | 'ferramentas';

@Component({
  selector: 'app-form-webhooks',
  templateUrl: './form-webhooks.component.html',
  styleUrls: ['./form-webhooks.component.scss'],
  standalone: false,
})
export class FormWebhooksComponent implements OnInit, OnDestroy {
  webhooks: FormWebhook[] = [];
  loading = false;
  error: string | null = null;

  templates: Template[] = [];
  templatesLoaded = false;
  smtps: SmtpServer[] = [];

  modal = false;
  saving = false;
  editingId: string | null = null;
  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  historyFor: FormWebhook | null = null;
  history: FormSubmission[] = [];
  historyLoading = false;
  historyError: string | null = null;

  guideFor: FormWebhook | null = null;
  guideTab: GuideTab = 'html';

  readonly statusLabels: Record<FormSubmissionStatus, string> = {
    queued: 'na fila',
    sent: 'enviado',
    failed: 'falhou',
    rejected: 'recusado',
  };

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    templateId: 'Template',
    smtpId: 'Servidor SMTP',
    hourlyLimit: 'Limite por hora',
    redirectUrl: 'Página de obrigado',
    emailField: 'Campo do email',
    nameField: 'Campo do nome',
  };

  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Dê um nome com 2 a 80 caracteres, como o nome do formulário.',
    templateId: 'Escolha o template do email.',
    hourlyLimit: 'Use um número entre 1 e 5000.',
    redirectUrl: 'Use um endereço completo, começando com https://.',
  };

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      templateId: ['', Validators.required],
      smtpId: [null as string | null],
      hourlyLimit: [100, [Validators.required, Validators.min(1), Validators.max(5000)]],
      redirectUrl: ['', Validators.pattern(/^https?:\/\/\S+$/)],
      emailField: ['', Validators.maxLength(100)],
      nameField: ['', Validators.maxLength(100)],
      isActive: [true],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    this.load();
    this.api.getTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
        this.templatesLoaded = true;
      },
      error: (err) => {
        this.templatesLoaded = true;
        this.toast.apiError(err);
      },
    });
    this.api.getSmtp().subscribe({ next: (smtps) => (this.smtps = smtps), error: () => (this.smtps = []) });
  }

  ngOnDestroy(): void {
    this.serverErrors.destroy();
  }

  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.getFormWebhooks().subscribe({
      next: (webhooks) => {
        this.webhooks = webhooks;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
      },
    });
  }

  trackById(_: number, webhook: FormWebhook): string {
    return webhook.id;
  }

  openCreate(): void {
    this.editingId = null;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({
      name: '',
      templateId: this.templates.length === 1 ? this.templates[0]._id : '',
      smtpId: null,
      hourlyLimit: 100,
      redirectUrl: '',
      emailField: '',
      nameField: '',
      isActive: true,
    });
    this.modal = true;
  }

  openEdit(webhook: FormWebhook): void {
    this.editingId = webhook.id;
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({
      name: webhook.name,
      templateId: webhook.templateId,
      smtpId: webhook.smtpId,
      hourlyLimit: webhook.hourlyLimit,
      redirectUrl: webhook.redirectUrl,
      emailField: webhook.emailField,
      nameField: webhook.nameField,
      isActive: webhook.isActive,
    });
    this.modal = true;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    const v = this.form.value;
    const payload: SaveFormWebhookInput = {
      name: String(v.name).trim(),
      templateId: v.templateId,
      smtpId: v.smtpId || null,
      hourlyLimit: Number(v.hourlyLimit),
      redirectUrl: String(v.redirectUrl || '').trim(),
      emailField: String(v.emailField || '').trim(),
      nameField: String(v.nameField || '').trim(),
      isActive: !!v.isActive,
    };
    if (this.editingId) payload.id = this.editingId;

    this.saving = true;
    this.formError = '';
    this.api.saveFormWebhook(payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.modal = false;
        this.upsert(res.webhook);
        this.toast.success(this.editingId ? 'Webhook atualizado.' : 'Webhook criado. Copie a URL e cole no seu formulário.');
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  toggleActive(webhook: FormWebhook): void {
    this.api.saveFormWebhook({ ...this.toInput(webhook), isActive: !webhook.isActive }).subscribe({
      next: (res) => {
        this.upsert(res.webhook);
        this.toast.success(res.webhook.isActive ? 'Webhook ativado.' : 'Webhook pausado: novos envios serão ignorados.');
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  regenerate(webhook: FormWebhook): void {
    this.confirm
      .ask({
        title: 'Gerar nova URL',
        message: `A URL atual de "${webhook.name}" para de funcionar na hora.\n\nOs formulários que usam a URL antiga precisarão ser atualizados.`,
        confirmLabel: 'Gerar nova URL',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.regenerateFormWebhook(webhook.id).subscribe({
          next: (res) => {
            this.upsert(res.webhook);
            this.toast.success(res.message);
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  remove(webhook: FormWebhook): void {
    this.confirm
      .ask({
        title: 'Excluir webhook',
        message: `Excluir "${webhook.name}"?\n\nO formulário deixa de enviar emails e o histórico é apagado.`,
        confirmLabel: 'Excluir',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteFormWebhook(webhook.id).subscribe({
          next: () => {
            this.webhooks = this.webhooks.filter((w) => w.id !== webhook.id);
            this.toast.success('Webhook excluído.');
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  openHistory(webhook: FormWebhook): void {
    this.historyFor = webhook;
    this.history = [];
    this.loadHistory();
  }

  loadHistory(): void {
    if (!this.historyFor) return;
    this.historyLoading = true;
    this.historyError = null;
    this.api.getFormSubmissions(this.historyFor.id).subscribe({
      next: (rows) => {
        this.history = rows;
        this.historyLoading = false;
      },
      error: (err) => {
        this.historyLoading = false;
        this.historyError = apiErrorMessage(err);
      },
    });
  }

  fieldsOf(submission: FormSubmission): { key: string; value: string }[] {
    return Object.entries(submission.fields ?? {}).map(([key, value]) => ({ key, value }));
  }

  openGuide(webhook: FormWebhook): void {
    this.guideFor = webhook;
    this.guideTab = 'html';
  }

  htmlSnippet(url: string): string {
    return [
      `<form action="${url}" method="POST">`,
      '  <input name="nome" placeholder="Seu nome" required>',
      '  <input name="email" type="email" placeholder="Seu email" required>',
      '  <input name="telefone" placeholder="Telefone">',
      '  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">',
      '  <button type="submit">Enviar</button>',
      '</form>',
    ].join('\n');
  }

  jsSnippet(url: string): string {
    return [
      `fetch('${url}', {`,
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ nome: 'Ana', email: 'ana@empresa.com', telefone: '11 99999-0000' }),",
      '});',
    ].join('\n');
  }

  copy(value: string, label = 'URL copiada.'): void {
    navigator.clipboard?.writeText(value).then(
      () => this.toast.success(label),
      () => this.toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    );
  }

  private toInput(webhook: FormWebhook): SaveFormWebhookInput {
    return {
      id: webhook.id,
      name: webhook.name,
      templateId: webhook.templateId,
      smtpId: webhook.smtpId,
      hourlyLimit: webhook.hourlyLimit,
      redirectUrl: webhook.redirectUrl,
      emailField: webhook.emailField,
      nameField: webhook.nameField,
      isActive: webhook.isActive,
    };
  }

  private upsert(webhook: FormWebhook): void {
    const exists = this.webhooks.some((w) => w.id === webhook.id);
    this.webhooks = exists ? this.webhooks.map((w) => (w.id === webhook.id ? webhook : w)) : [webhook, ...this.webhooks];
  }
}
