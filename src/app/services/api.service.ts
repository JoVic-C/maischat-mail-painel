import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@env/environment';
import {
  ActivityPoint,
  ApiMessage,
  Campaign,
  ContactPage,
  ContactQuery,
  CreateTenantInput,
  FailureRow,
  DashboardStats,
  InvalidRow,
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
  ValidateRowEvent,
  ValidatedRow,
} from '../models';
import { AuthService } from './auth.service';

/** Callbacks do stream de validação de CSV (SSE). */
export interface ValidateStreamHandlers {
  start?: (total: number) => void;
  row?: (row: ValidateRowEvent) => void;
  done?: (summary: { total: number }) => void;
  error?: (message: string) => void;
}

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
  dashboardActivity(): Observable<ActivityPoint[]> {
    return this.http.get<ActivityPoint[]>(`${this.api}/dashboard/activity`);
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
  importValidated(rows: ValidatedRow[], listIds: string[]): Observable<ApiMessage & { imported: number }> {
    return this.http.post<ApiMessage & { imported: number }>(`${this.api}/contacts/import-validated`, {
      rows,
      listIds,
    });
  }
  exportInvalidContacts(rows: InvalidRow[]): Observable<Blob> {
    return this.http.post(`${this.api}/contacts/invalid-export`, { rows }, { responseType: 'blob' });
  }

  /**
   * Valida o CSV em streaming (SSE). O HttpClient não lida bem com streaming,
   * então usamos fetch() lendo o corpo em pedaços e emitindo cada evento via callbacks.
   */
  async validateCsvStream(
    csv: string,
    listIds: string[],
    on: ValidateStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      // O fetch NÃO passa pelo HttpInterceptor: token e cliente vão manualmente.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = this.auth.token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tenantId = this.auth.activeTenantId;
      if (tenantId && this.auth.isSuperadmin) headers['X-Tenant-Id'] = tenantId;

      const res = await fetch(`${this.api}/contacts/validate-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ csv, listIds }),
        signal,
      });
      if (!res.ok || !res.body) {
        on.error?.(res.status === 401 ? 'Sessão expirada. Faça login novamente.' : 'Falha ao iniciar a validação.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          let evt: { type: string; total?: number; message?: string };
          try {
            evt = JSON.parse(json);
          } catch {
            continue;
          }
          if (evt.type === 'start') on.start?.(evt.total ?? 0);
          else if (evt.type === 'row') on.row?.(evt as unknown as ValidateRowEvent);
          else if (evt.type === 'done') on.done?.({ total: evt.total ?? 0 });
          else if (evt.type === 'error') on.error?.(evt.message ?? 'Erro na validação.');
        }
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      on.error?.('Erro na validação.');
    }
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
  createTenant(data: CreateTenantInput): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.api}/tenants`, data);
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
