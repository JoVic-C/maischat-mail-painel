import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  Campaign,
  CampaignAttachment,
  LinkStat,
  List,
  SaveCampaignInput,
  Segment,
  SendLog,
  SendStatus,
  SmtpServer,
  Template,
} from '../../models';
import { ApiService } from '../../services/api.service';
import { baixarBlob } from '../../shared/download';
import { AuthService } from '../../services/auth.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { PromptService } from '../../shared/prompt/prompt.service';
import { apiErrorMessage, ServerErrorsHandler } from '../../shared/server-errors/server-errors';
import { ToastService } from '../../shared/toast/toast.service';

/** De quanto em quanto tempo a lista se atualiza sozinha enquanto há campanha em envio. */
const LIVE_REFRESH_MS = 5000;
const LOGS_PAGE_SIZE = 50;

interface SendLogRow extends SendLog {
  bounceInfo?: { title: string; explain: string };
}

@Component({
    selector: 'app-campaigns',
    templateUrl: './campaigns.component.html',
    styleUrls: ['./campaigns.component.scss'],
    standalone: false
})
export class CampaignsComponent implements OnInit, OnDestroy {
  campaigns: Campaign[] = [];
  templates: Template[] = [];
  lists: List[] = [];
  smtps: SmtpServer[] = [];
  segments: Segment[] = [];

  loading = false;
  error: string | null = null;

  modal = false;
  saving = false;
  editingId: string | null = null;
  attachments: CampaignAttachment[] = [];
  uploadingDoc = false;

  form: FormGroup;
  formError = '';
  serverErrors: ServerErrorsHandler;

  detailModal = false;
  detailCampaign: Campaign | null = null;
  logs: SendLogRow[] = [];
  loadingLogs = false;
  logsError: string | null = null;
  logsPage = 1;
  logsTotal = 0;
  logsLimit = LOGS_PAGE_SIZE;
  logStatusFilter: SendStatus | '' = '';

  scheduleModal = false;
  scheduling = false;
  scheduleCampaignRef: Campaign | null = null;
  scheduleAt = '';

  scopeModal = false;
  scopeCampaign: Campaign | null = null;
  starting = false;

  private readonly FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    templateId: 'Template',
    listIds: 'Listas',
    smtpId: 'Servidor SMTP',
    segmentId: 'Segmento',
  };

  /** Mensagens da validação local; a do servidor, quando vier, tem prioridade. */
  private readonly LOCAL_ERRORS: Record<string, string> = {
    name: 'Informe um nome com ao menos 2 caracteres.',
    templateId: 'Escolha o template do email.',
    listIds: 'Selecione ao menos uma lista de destinatários.',
  };

  /** Texto de erro do campo (servidor ou validação local). */
  fieldError(field: string): string {
    return this.serverErrors.messageFor(field, this.LOCAL_ERRORS);
  }


  private pendingOpenId: string | null = null;
  private liveTimer?: ReturnType<typeof setInterval>;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private confirm: ConfirmService,
    private prompt: PromptService,
    private auth: AuthService,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      templateId: ['', Validators.required],
      listIds: [[] as string[], Validators.required],
      smtpId: [null as string | null],
      segmentId: [null as string | null],
    });
    this.serverErrors = new ServerErrorsHandler(this.form);
  }

  ngOnInit(): void {
    // Veio do dashboard com ?open=<id> → abre o detalhe dessa campanha após carregar.
    this.pendingOpenId = this.route.snapshot.queryParamMap.get('open');
    this.load();

    // Os apoios (template/lista/smtp/segmento) alimentam o formulário; se um falhar,
    // avisa mas não derruba a tela principal.
    this.api.getTemplates().subscribe({ next: (t) => (this.templates = t), error: (e) => this.toast.apiError(e) });
    this.api.getLists().subscribe({ next: (l) => (this.lists = l), error: (e) => this.toast.apiError(e) });
    this.api.getSegments().subscribe({ next: (s) => (this.segments = s), error: (e) => this.toast.apiError(e) });
    // SMTP é restrito a admin — usuário comum simplesmente não escolhe servidor.
    if (this.isAdmin) {
      this.api.getSmtp().subscribe({ next: (s) => (this.smtps = s), error: () => (this.smtps = []) });
    }
  }

  ngOnDestroy(): void {
    this.stopLiveRefresh();
    this.serverErrors.destroy();
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin;
  }

  // ─── Carregamento e atualização ao vivo ───

  load(): void {
    this.loading = !this.campaigns.length; // refresh silencioso quando já há dados na tela
    this.error = null;
    this.api.getCampaigns().subscribe({
      next: (campaigns) => {
        this.campaigns = campaigns;
        this.loading = false;
        this.syncLiveRefresh();

        if (this.pendingOpenId) {
          const target = campaigns.find((c) => c._id === this.pendingOpenId);
          this.pendingOpenId = null;
          if (target) this.viewDetail(target);
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err);
        this.stopLiveRefresh();
      },
    });
  }

  /** Há disparo em andamento? Então as métricas mudam sozinhas e a tela acompanha. */
  get liveRefreshOn(): boolean {
    return !!this.liveTimer;
  }

  private get hasRunning(): boolean {
    return this.campaigns.some((c) => c.status === 'sending' || c.status === 'queued');
  }

  private syncLiveRefresh(): void {
    if (this.hasRunning && !this.liveTimer) {
      this.liveTimer = setInterval(() => this.silentRefresh(), LIVE_REFRESH_MS);
    } else if (!this.hasRunning && this.liveTimer) {
      this.stopLiveRefresh();
    }
  }

  private stopLiveRefresh(): void {
    clearInterval(this.liveTimer);
    this.liveTimer = undefined;
  }

  /** Atualiza os números sem piscar a tela (sem skeleton, sem mensagem de erro). */
  private silentRefresh(): void {
    this.api.getCampaigns().subscribe({
      next: (campaigns) => {
        this.campaigns = campaigns;
        this.syncLiveRefresh();
        // Painel de detalhe aberto de uma campanha em envio: acompanha junto.
        const open = this.detailCampaign;
        if (open && (open.status === 'sending' || open.status === 'queued')) {
          const fresh = campaigns.find((c) => c._id === open._id);
          if (fresh) this.detailCampaign = fresh;
          this.loadLogs(true);
        }
      },
      error: () => this.stopLiveRefresh(), // parou de responder: não insiste em silêncio
    });
  }

  /**
   * Baixa o relatório de envios da campanha.
   *
   * O arquivo vem transmitido do servidor (uma linha por destinatário), então aqui só
   * entregamos o blob ao navegador — nada é montado nem acumulado na tela.
   */
  baixarRelatorio(c: Campaign): void {
    this.api.campaignReport(c._id).subscribe({
      next: (res) => {
        // O nome vem do cabeçalho: é o servidor que sabe se saiu .xlsx ou .csv.
        baixarBlob(res.body as Blob, 'envios.xlsx', res.headers.get('Content-Disposition'));
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  /** Só rascunho e agendada podem ser editadas — o backend recusa editar em envio. */
  canEdit(c: Campaign): boolean {
    return c.status === 'draft' || c.status === 'scheduled';
  }

  // ─── CRUD ───

  openCreate(): void {
    this.editingId = null;
    this.attachments = [];
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({ name: '', templateId: '', listIds: [], smtpId: null, segmentId: null });
    this.modal = true;
  }

  openEdit(c: Campaign): void {
    this.editingId = c._id;
    this.attachments = c.attachments.map((a) => ({ ...a }));
    this.formError = '';
    this.serverErrors.clear();
    this.form.reset({
      name: c.name,
      templateId: c.templateId,
      listIds: [...c.listIds],
      smtpId: c.smtpId,
      segmentId: c.segmentId,
    });
    this.modal = true;
  }

  onDocSelected(event: Event, input: HTMLInputElement): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingDoc = true;
    this.api.uploadDoc(file).subscribe({
      next: (res) => {
        this.uploadingDoc = false;
        input.value = '';
        this.attachments.push(res);
        this.toast.success('Anexo adicionado.');
      },
      error: (err) => {
        this.uploadingDoc = false;
        input.value = '';
        this.toast.apiError(err);
      },
    });
  }

  removeAttachment(i: number): void {
    this.attachments.splice(i, 1);
  }

  fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  save(): void {
    if (this.form.invalid || !this.form.value.listIds?.length) {
      this.form.markAllAsTouched();
      ServerErrorsHandler.scrollToFirstInvalid();
      return;
    }
    const payload: SaveCampaignInput = { ...this.form.value, attachments: this.attachments };
    if (this.editingId) payload.id = this.editingId;

    this.saving = true;
    this.formError = '';
    this.api.saveCampaign(payload).subscribe({
      next: () => {
        this.saving = false;
        this.modal = false;
        this.toast.success(this.editingId ? 'Campanha atualizada.' : 'Campanha criada.');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.formError = this.serverErrors.apply(err, this.FIELD_LABELS);
        ServerErrorsHandler.scrollToFirstInvalid();
      },
    });
  }

  remove(c: Campaign): void {
    this.confirm
      .ask({
        title: 'Excluir campanha',
        message: `Excluir a campanha "${c.name}"?\n\nO histórico de envios dela também será apagado.`,
        confirmLabel: 'Excluir',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.deleteCampaign(c._id).subscribe({
          next: () => {
            this.toast.success('Campanha excluída.');
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  // ─── Disparo ───

  /** Abre o modal que pergunta o escopo do disparo (todos vs só entregues). */
  start(c: Campaign): void {
    this.scopeCampaign = c;
    this.scopeModal = true;
  }

  doStart(onlyDelivered: boolean): void {
    const c = this.scopeCampaign;
    if (!c) return;
    this.starting = true;
    this.api.startCampaign(c._id, onlyDelivered).subscribe({
      next: (res) => {
        this.starting = false;
        this.scopeModal = false;
        this.toast.success(res.message);
        this.load(); // o auto-refresh assume a partir daqui
      },
      error: (err) => {
        this.starting = false;
        this.toast.apiError(err);
      },
    });
  }

  refresh(c: Campaign): void {
    this.api.getCampaign(c._id).subscribe({
      next: (fresh) => {
        const i = this.campaigns.findIndex((x) => x._id === c._id);
        if (i >= 0) this.campaigns[i] = fresh;
        this.syncLiveRefresh();
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  pause(c: Campaign): void {
    this.api.pauseCampaign(c._id).subscribe({
      next: () => {
        this.toast.success('Campanha pausada.');
        this.load();
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  resume(c: Campaign): void {
    this.api.resumeCampaign(c._id).subscribe({
      next: () => {
        this.toast.success('Campanha retomada.');
        this.load();
      },
      error: (err) => this.toast.apiError(err),
    });
  }

  testSend(c: Campaign): void {
    this.prompt
      .ask({
        title: 'Enviar email de teste',
        message: `Envia uma cópia da campanha "${c.name}" com dados de exemplo, sem tracking.`,
        label: 'Destinatário',
        type: 'email',
        placeholder: 'voce@empresa.com',
        confirmLabel: 'Enviar teste',
      })
      .then((email) => {
        if (!email) return;
        this.api.testEmailCampaign(c._id, email).subscribe({
          next: (res) => this.toast.success(res.message),
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  // ─── Agendamento ───

  openSchedule(c: Campaign): void {
    this.scheduleCampaignRef = c;
    this.scheduleAt = '';
    this.scheduleModal = true;
  }

  confirmSchedule(): void {
    const c = this.scheduleCampaignRef;
    if (!c) return;
    if (!this.scheduleAt) {
      this.toast.warn('Escolha data e hora.');
      return;
    }
    const when = new Date(this.scheduleAt);
    if (when.getTime() <= Date.now()) {
      this.toast.warn('A data de agendamento deve ser no futuro.');
      return;
    }
    this.scheduling = true;
    // datetime-local vem sem timezone; new Date() interpreta como local e o toISOString converte p/ UTC.
    this.api.scheduleCampaign(c._id, when.toISOString()).subscribe({
      next: (res) => {
        this.scheduling = false;
        this.scheduleModal = false;
        this.toast.success(res.message);
        this.load();
      },
      error: (err) => {
        this.scheduling = false;
        this.toast.apiError(err);
      },
    });
  }

  unschedule(c: Campaign): void {
    this.confirm
      .ask({
        title: 'Cancelar agendamento',
        message: `Cancelar o agendamento da campanha "${c.name}"?`,
        confirmLabel: 'Cancelar agendamento',
        cancelLabel: 'Voltar',
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api.unscheduleCampaign(c._id).subscribe({
          next: (res) => {
            this.toast.success(res.message);
            this.load();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  // ─── Detalhe do disparo ───

  viewDetail(c: Campaign): void {
    this.detailCampaign = c;
    this.logs = [];
    this.logsPage = 1;
    this.logStatusFilter = '';
    this.detailModal = true;

    this.api.getCampaign(c._id).subscribe({
      next: (fresh) => (this.detailCampaign = fresh),
      error: (err) => this.toast.apiError(err),
    });
    this.loadLogs();
  }

  closeDetail(): void {
    this.detailModal = false;
    this.detailCampaign = null;
    this.logs = [];
  }

  /** `silent` = atualização automática: não mostra skeleton nem erro na tela. */
  loadLogs(silent = false): void {
    const c = this.detailCampaign;
    if (!c) return;
    if (!silent) {
      this.loadingLogs = true;
      this.logsError = null;
    }
    this.api.campaignLogs(c._id, this.logsPage, this.logsLimit, this.logStatusFilter).subscribe({
      next: (res) => {
        this.logs = res.logs.map((log) => ({ ...log, bounceInfo: this.bounceInfo(log.error) }));
        this.logsTotal = res.total;
        this.logsPage = res.page;
        this.logsLimit = res.limit;
        this.loadingLogs = false;
      },
      error: (err) => {
        this.loadingLogs = false;
        if (!silent) this.logsError = apiErrorMessage(err);
      },
    });
  }

  reloadLogs(): void {
    this.logsPage = 1;
    this.loadLogs();
  }

  goToLogsPage(page: number): void {
    this.logsPage = page;
    this.loadLogs();
  }

  get logsEmptyText(): string {
    return this.logStatusFilter
      ? 'Nenhum envio com essa situação.'
      : 'Esta campanha ainda não foi disparada. Clique em ▶ disparar para enviar os emails.';
  }

  markBounce(log: SendLogRow): void {
    this.confirm
      .ask({
        title: 'Marcar como bounce',
        message: `Marcar ${log.email} como endereço inválido?\n\nO contato deixa de receber campanhas — use quando souber que o endereço não existe.`,
        confirmLabel: 'Marcar bounce',
        danger: true,
      })
      .then((ok) => {
        if (!ok || !this.detailCampaign) return;
        this.api.reportBounce(log.email, this.detailCampaign._id).subscribe({
          next: (res) => {
            this.toast.success(res.message);
            this.loadLogs();
          },
          error: (err) => this.toast.apiError(err),
        });
      });
  }

  // ─── Apresentação ───

  sortedLinks(links: LinkStat[] | undefined): LinkStat[] {
    return [...(links ?? [])].sort((a, b) => b.clicks - a.clicks);
  }

  pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }

  ratePct(part: number | undefined, total: number | undefined): string {
    return total && part !== undefined ? `(${this.pct(part, total)}%)` : '';
  }

  fmt(d: string): string {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Traduz e explica o erro técnico do SMTP em linguagem para o cliente. */
  bounceInfo(raw: string): { title: string; explain: string } {
    const e = (raw || '').toLowerCase();
    const has = (...keys: string[]): boolean => keys.some((k) => e.includes(k));

    if (!raw) return { title: 'Não entregue', explain: 'O email não pôde ser entregue.' };

    if (has('simulado'))
      return {
        title: 'Bounce marcado manualmente',
        explain: 'Marcado por um administrador — não veio do servidor de email.',
      };

    // Autenticação: problema de configuração do SMTP, NÃO do destinatário
    if (
      has(
        '535',
        '534',
        '530',
        'incorrect authentication',
        'invalid login',
        'authentication failed',
        'username and password not accepted'
      )
    )
      return {
        title: 'Falha de login no servidor de envio',
        explain:
          'Usuário ou senha do SMTP estão incorretos. Não é problema do destinatário — verifique as credenciais na tela de SMTP.',
      };

    // Conexão com o servidor de envio
    if (has('econnrefused', 'etimedout', 'timeout', 'getaddrinfo', 'enotfound', 'econnreset', 'socket', 'connection'))
      return {
        title: 'Servidor de envio indisponível',
        explain:
          'Não foi possível conectar ao servidor SMTP (host/porta errados ou fora do ar). Não é problema do destinatário.',
      };

    // Destinatário inexistente
    if (
      has(
        '550',
        'user unknown',
        'no such user',
        'does not exist',
        'recipient not found',
        'mailbox unavailable',
        '5.1.1',
        'address rejected',
        'recipient rejected'
      )
    )
      return {
        title: 'Endereço não existe',
        explain: 'A caixa de email do destinatário não existe ou foi desativada. Recomendado remover este contato.',
      };

    // Caixa cheia
    if (has('552', 'quota', 'mailbox full', 'over quota', 'insufficient'))
      return {
        title: 'Caixa de entrada cheia',
        explain: 'O destinatário está sem espaço na caixa. Costuma ser temporário — vale tentar mais tarde.',
      };

    // Bloqueio por spam/reputação
    if (has('554', 'spam', 'blocked', 'blacklist', 'reputation', 'policy', 'denied', 'rejected due'))
      return {
        title: 'Bloqueado por antispam',
        explain:
          'O servidor do destinatário recusou por política de spam/reputação. Verifique SPF/DKIM e a reputação do remetente.',
      };

    // Falha temporária (soft)
    if (has('421', '450', 'try again', 'temporarily', 'temporary', 'rate limit', 'throttl', 'greylist'))
      return {
        title: 'Falha temporária',
        explain: 'O servidor do destinatário pediu para tentar novamente depois. Geralmente se resolve sozinho.',
      };

    return { title: 'Falha na entrega', explain: 'O email não foi aceito pelo servidor do destinatário.' };
  }
}
