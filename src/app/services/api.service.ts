import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@env/environment';
import {
  Agrupamento,
  ApiMessage,
  Campaign,
  ContactPage,
  RelatorioEnvios,
  ContactQuery,
  CreateTenantInput,
  CreateTenantResult,
  FailureRow,
  DashboardStats,
  ImportJob,
  InviteLink,
  InvitePreview,
  List,
  LoginResult,
  ManagedUser,
  PlatformOverview,
  ResetLink,
  PlatformSettings,
  SavePlatformSettingsInput,
  SaveCampaignInput,
  SaveContactInput,
  SaveListInput,
  SaveSegmentInput,
  SaveSmtpInput,
  SaveTemplateInput,
  SaveUserInput,
  Segment,
  SendLogPage,
  SmtpCredentials,
  SmtpServer,
  Template,
  TenantSummary,
  UpdateTenantInput,
  UploadedImage,
  OpenImport,
} from '../models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private api = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private auth: AuthService
  ) {}

  private params(obj: Record<string, string | number | undefined | null>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return p;
  }

  // ─── Dashboard ───
  dashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.api}/dashboard/stats`);
  }
  /**
   * Relatório de envios da conta no período, com totais e série para o gráfico.
   * Sem parâmetros, o servidor devolve os últimos 30 dias agrupados por dia.
   */
  dashboardSends(de?: string, ate?: string, agrupamento?: Agrupamento): Observable<RelatorioEnvios> {
    return this.http.get<RelatorioEnvios>(`${this.api}/dashboard/sends`, {
      params: this.params({ de, ate, agrupamento }),
    });
  }

  // ─── Listas ───
  getLists(): Observable<List[]> {
    return this.http.get<List[]>(`${this.api}/lists`);
  }
  saveList(data: SaveListInput): Observable<ApiMessage & { list: List }> {
    return this.http.post<ApiMessage & { list: List }>(`${this.api}/lists/save`, data);
  }
  deleteList(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/lists/${id}`);
  }
  resyncListCounts(): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/lists/resync-counts`, {});
  }

  // ─── Contatos ───
  getContacts(query: ContactQuery = {}): Observable<ContactPage> {
    return this.http.get<ContactPage>(`${this.api}/contacts`, {
      params: this.params({
        search: query.search,
        listId: query.listId,
        status: query.status,
        delivery: query.delivery,
        page: query.page ?? 1,
        limit: query.limit ?? 50,
      }),
    });
  }
  /**
   * Exporta contatos em CSV, com os mesmos filtros da listagem.
   * O servidor transmite o arquivo direto do banco — nada é montado aqui.
   */
  exportContacts(query: ContactQuery = {}): Observable<Blob> {
    return this.http.get(`${this.api}/contacts/export`, {
      params: this.params({
        search: query.search,
        listId: query.listId,
        status: query.status,
        delivery: query.delivery,
      }),
      responseType: 'blob',
    });
  }

  saveContact(data: SaveContactInput): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/contacts/save`, data);
  }
  reactivateContact(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/contacts/${id}/reactivate`, {});
  }
  deleteContact(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/contacts/${id}`);
  }
  bulkDeleteContacts(ids: string[]): Observable<ApiMessage & { deleted: number }> {
    return this.http.post<ApiMessage & { deleted: number }>(`${this.api}/contacts/bulk-delete`, { ids });
  }

  // ─── Importação de contatos em massa ───
  // O CSV sobe como arquivo e o servidor devolve um job. Nenhuma chamada daqui
  // carrega linhas de contato: elas ficam no servidor do upload até a gravação.

  /** Envia o arquivo e devolve o job criado. Aceita um Blob, para o CSV colado na tela. */
  startImport(file: Blob, filename: string, listIds: string[]): Observable<{ id: string; status: string }> {
    const fd = new FormData();
    fd.append('file', file, filename);
    // multipart não tem array: vai como lista separada por vírgula.
    if (listIds.length) fd.append('listIds', listIds.join(','));
    return this.http.post<{ id: string; status: string }>(`${this.api}/contacts/import`, fd);
  }

  getImport(id: string): Observable<ImportJob> {
    return this.http.get<ImportJob>(`${this.api}/contacts/import/${id}`);
  }

  /** Importações ainda em aberto — deixa a tela retomar um job depois de recarregar. */
  getOpenImports(): Observable<OpenImport[]> {
    return this.http.get<OpenImport[]>(`${this.api}/contacts/import/open`);
  }

  confirmImport(id: string, listIds: string[]): Observable<ApiMessage & { id: string }> {
    return this.http.post<ApiMessage & { id: string }>(`${this.api}/contacts/import/${id}/confirm`, { listIds });
  }

  cancelImport(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/contacts/import/${id}/cancel`, {});
  }

  /** Relatório dos recusados, montado no servidor a partir do resultado guardado. */
  downloadImportInvalid(id: string): Observable<Blob> {
    return this.http.get(`${this.api}/contacts/import/${id}/invalid`, { responseType: 'blob' });
  }

  // ─── Templates ───
  getTemplates(): Observable<Template[]> {
    return this.http.get<Template[]>(`${this.api}/templates`);
  }
  saveTemplate(data: SaveTemplateInput): Observable<ApiMessage & { template: Template }> {
    return this.http.post<ApiMessage & { template: Template }>(`${this.api}/templates/save`, data);
  }
  previewTemplate(data: { html: string; subject?: string }): Observable<{ html: string; subject?: string }> {
    return this.http.post<{ html: string; subject?: string }>(`${this.api}/templates/preview`, data);
  }
  uploadImage(file: File): Observable<UploadedImage> {
    const fd = new FormData();
    fd.append('image', file);
    return this.http.post<UploadedImage>(`${this.api}/upload/image`, fd);
  }
  uploadDoc(file: File): Observable<{ filename: string; storedName: string; size: number }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ filename: string; storedName: string; size: number }>(`${this.api}/upload/file`, fd);
  }
  duplicateTemplate(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/templates/${id}/duplicate`, {});
  }
  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/templates/${id}`);
  }

  // ─── Campanhas ───
  getCampaigns(): Observable<Campaign[]> {
    return this.http.get<Campaign[]>(`${this.api}/campaigns`);
  }
  getCampaign(id: string): Observable<Campaign> {
    return this.http.get<Campaign>(`${this.api}/campaigns/${id}`);
  }
  saveCampaign(data: SaveCampaignInput): Observable<ApiMessage & { campaign: Campaign }> {
    return this.http.post<ApiMessage & { campaign: Campaign }>(`${this.api}/campaigns/save`, data);
  }
  startCampaign(id: string, onlyDelivered = false): Observable<ApiMessage & { queued: number }> {
    return this.http.post<ApiMessage & { queued: number }>(`${this.api}/campaigns/${id}/start`, { onlyDelivered });
  }
  pauseCampaign(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/campaigns/${id}/pause`, {});
  }
  resumeCampaign(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/campaigns/${id}/resume`, {});
  }
  testEmailCampaign(id: string, email: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/campaigns/${id}/test-email`, { email });
  }
  scheduleCampaign(id: string, scheduledAt: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/campaigns/${id}/schedule`, { scheduledAt });
  }
  unscheduleCampaign(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/campaigns/${id}/unschedule`, {});
  }
  deleteCampaign(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/campaigns/${id}`);
  }

  /** Envios da campanha. O corpo é o array; a paginação vem nos headers X-*. */
  /** Relatório de envios em CSV. O backend transmite o arquivo direto do banco. */
  /**
   * Relatório de envios. Sai em .xlsx; o servidor cai para CSV sozinho quando a
   * campanha passa do limite de linhas de uma planilha.
   *
   * Observa a resposta inteira porque o nome do arquivo — e a extensão certa — vem no
   * cabeçalho: quem decide o formato é o servidor, não a tela.
   */
  campaignReport(id: string, status = ''): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.api}/campaigns/${id}/report`, {
      params: this.params({ status }),
      responseType: 'blob',
      observe: 'response',
    });
  }

  campaignLogs(id: string, page = 1, limit = 50, status = ''): Observable<SendLogPage> {
    return this.http
      .get<SendLogPage['logs']>(`${this.api}/campaigns/${id}/logs`, {
        params: this.params({ page, limit, status }),
        observe: 'response',
      })
      .pipe(
        map((res) => ({
          logs: res.body ?? [],
          total: Number(res.headers.get('X-Total-Count') ?? res.body?.length ?? 0),
          page: Number(res.headers.get('X-Page') ?? page),
          limit: Number(res.headers.get('X-Page-Size') ?? limit),
        }))
      );
  }

  // ─── Bounces (admin) ───
  reportBounce(email: string, campaignId?: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/bounces`, { email, campaignId });
  }

  // ─── Segmentos ───
  getSegments(): Observable<Segment[]> {
    return this.http.get<Segment[]>(`${this.api}/segments`);
  }
  saveSegment(data: SaveSegmentInput): Observable<ApiMessage & { segment: Segment }> {
    return this.http.post<ApiMessage & { segment: Segment }>(`${this.api}/segments/save`, data);
  }
  previewSegment(id: string): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.api}/segments/${id}/preview`);
  }
  deleteSegment(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/segments/${id}`);
  }

  // ─── SMTP (admin) ───
  getSmtp(): Observable<SmtpServer[]> {
    return this.http.get<SmtpServer[]>(`${this.api}/smtp`);
  }
  saveSmtp(data: SaveSmtpInput): Observable<ApiMessage & { server: SmtpServer }> {
    return this.http.post<ApiMessage & { server: SmtpServer }>(`${this.api}/smtp/save`, data);
  }
  testSmtp(creds: SmtpCredentials): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/smtp/test`, creds);
  }
  sendSmtpTestEmail(creds: SmtpCredentials, from: string, to: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/smtp/test-email`, { ...creds, from, to });
  }
  deleteSmtp(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/smtp/${id}`);
  }

  // ─── Usuários do cliente (admin) ───
  getUsers(): Observable<ManagedUser[]> {
    return this.http.get<ManagedUser[]>(`${this.api}/users`);
  }
  /** Convite: dados públicos da tela de definir senha (sem sessão). */
  getInvite(token: string): Observable<InvitePreview> {
    return this.http.get<InvitePreview>(`${this.api}/auth/invite`, { params: { token } });
  }

  /** Convite: define a senha e já devolve a sessão iniciada. */
  acceptInvite(token: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResult>(`${this.api}/auth/invite/accept`, { token, password });
  }

  /** Reenvia o convite de quem ainda não definiu a senha (invalida o link anterior). */
  resendInvite(id: string): Observable<ApiMessage & { invite: InviteLink }> {
    return this.http.post<ApiMessage & { invite: InviteLink }>(`${this.api}/users/${id}/resend-invite`, {});
  }

  /** O convite só vem na resposta quando o usuário foi criado SEM senha. */
  // ─── Recuperação de senha ───

  /** Pedido feito na tela de login. A resposta é sempre a mesma, exista o email ou não. */
  forgotPassword(email: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/auth/forgot-password`, { email });
  }

  /** Dados públicos do link de redefinição (sem sessão). */
  getReset(token: string): Observable<InvitePreview> {
    return this.http.get<InvitePreview>(`${this.api}/auth/reset`, { params: { token } });
  }

  /** Define a nova senha pelo link e já devolve a sessão iniciada. */
  resetPassword(token: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResult>(`${this.api}/auth/reset`, { token, password });
  }

  /** Admin/superadmin gera um link de redefinição para um usuário do cliente. */
  userResetLink(id: string): Observable<ApiMessage & { reset: ResetLink }> {
    return this.http.post<ApiMessage & { reset: ResetLink }>(`${this.api}/users/${id}/reset-link`, {});
  }

  saveUser(data: SaveUserInput): Observable<ApiMessage & { user: ManagedUser; invite?: InviteLink }> {
    return this.http.post<ApiMessage & { user: ManagedUser; invite?: InviteLink }>(`${this.api}/users/save`, data);
  }
  revokeUserSessions(id: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/users/${id}/revoke-sessions`, {});
  }
  deleteUser(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/users/${id}`);
  }

  // ─── Clientes da plataforma (superadmin) ───
  getTenants(): Observable<TenantSummary[]> {
    return this.http.get<TenantSummary[]>(`${this.api}/tenants`);
  }
  createTenant(data: CreateTenantInput): Observable<ApiMessage & { tenant: CreateTenantResult }> {
    return this.http.post<ApiMessage & { tenant: CreateTenantResult }>(`${this.api}/tenants`, data);
  }
  updateTenant(id: string, data: UpdateTenantInput): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.api}/tenants/${id}`, data);
  }
  deleteTenant(id: string, confirmSlug: string): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.api}/tenants/${id}`, { body: { confirmSlug } });
  }

  // ─── Motor de envio (superadmin) ───
  /** Operação da plataforma: fila + números por cliente (sem dado pessoal). */
  platformOverview(hours = 24): Observable<PlatformOverview> {
    return this.http.get<PlatformOverview>(`${this.api}/platform-monitor/overview`, { params: { hours } });
  }

  /** Falhas detalhadas de todos os clientes. Expõe email de destinatário — auditado no servidor. */
  platformFailures(limit = 50): Observable<FailureRow[]> {
    return this.http.get<FailureRow[]>(`${this.api}/platform-monitor/failures`, { params: { limit } });
  }

  getPlatformSettings(): Observable<PlatformSettings> {
    return this.http.get<PlatformSettings>(`${this.api}/platform-settings`);
  }
  savePlatformSettings(data: SavePlatformSettingsInput): Observable<ApiMessage & { settings: PlatformSettings }> {
    return this.http.put<ApiMessage & { settings: PlatformSettings }>(`${this.api}/platform-settings`, data);
  }
}
