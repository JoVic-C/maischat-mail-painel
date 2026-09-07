import type { Page, Route } from '@playwright/test';
import type {
  AuthUser,
  Campaign,
  CampaignStatus,
  DashboardStats,
  List,
  PlatformSettings,
  RelatorioEnvios,
  SendLog,
  SendStatus,
  Segment,
  SmtpServer,
  Template,
  TenantSummary,
} from '../../src/app/models';

/** Mesma origem configurada em src/environments/environment.ts. */
export const API_ORIGIN = 'http://localhost:3000';

export const TEST_TOKEN = 'jwt.de.teste';

export const ADMIN: AuthUser = {
  id: 'u-admin',
  email: 'admin@empresa.com',
  name: 'Ana Admin',
  role: 'admin',
  tenantId: 't-acme',
};

export const OPERATOR: AuthUser = {
  id: 'u-op',
  email: 'operador@empresa.com',
  name: 'Olavo Operador',
  role: 'user',
  tenantId: 't-acme',
};

export const SUPERADMIN: AuthUser = {
  id: 'u-root',
  email: 'root@mmail.com',
  name: 'Root',
  role: 'superadmin',
  tenantId: null,
};

/**
 * O dublê responde de outra origem (:3000) para a página (:4200), então cada resposta
 * precisa dos cabeçalhos de CORS — incluindo o expose, senão o Angular não consegue
 * ler o X-Total-Count da paginação de envios.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'X-Total-Count,X-Page,X-Page-Size',
};

const ISO = '2026-08-20T12:00:00.000Z';

// ─── Fábricas ───

export function makeCampaign(over: Partial<Campaign> & { name: string }): Campaign {
  return {
    _id: `c-${over.name.toLowerCase().replace(/\W+/g, '-')}`,
    templateId: 't-boas-vindas',
    listIds: ['l-clientes'],
    smtpId: null,
    segmentId: null,
    status: 'draft',
    stats: { total: 0, sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0, unsubscribed: 0 },
    linkStats: [],
    attachments: [],
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

export function makeTemplate(over: Partial<Template> & { name: string }): Template {
  return {
    _id: `t-${over.name.toLowerCase().replace(/\W+/g, '-')}`,
    subject: `Assunto de ${over.name}`,
    html: '<p>Olá {{name}}</p>',
    variables: ['name'],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

export function makeList(over: Partial<List> & { name: string }): List {
  return {
    _id: `l-${over.name.toLowerCase().replace(/\W+/g, '-')}`,
    description: '',
    type: 'private',
    tags: [],
    contactCount: 10,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

export function makeSegment(over: Partial<Segment> & { name: string }): Segment {
  return {
    _id: `s-${over.name.toLowerCase().replace(/\W+/g, '-')}`,
    rules: [{ field: 'company', operator: 'contains', value: 'acme' }],
    matchAll: true,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

export function makeLog(over: Partial<SendLog> & { email: string; status: SendStatus }): SendLog {
  return {
    _id: `sl-${over.email}`,
    campaignId: 'c-newsletter',
    contactId: `ct-${over.email}`,
    error: '',
    messageId: 'msg-1',
    openCount: 0,
    clickCount: 0,
    sentAt: ISO,
    openedAt: null,
    clickedAt: null,
    createdAt: ISO,
    ...over,
  };
}

/** Resposta de erro no formato do errorHandler do backend. */
export interface ApiFailure {
  status: number;
  body: unknown;
}

export interface RecordedCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  query: Record<string, string>;
}

/** Valores que a API devolveria numa instalação recém-semeada pelo .env. */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  workerConcurrency: 5,
  ratePerMinute: 600,
  updatedByEmail: '',
  updatedAt: null,
  bounds: {
    workerConcurrency: { min: 1, max: 50 },
    ratePerMinute: { min: 1, max: 100_000 },
  },
};

export interface MockSeed {
  user?: AuthUser;
  platformSettings?: PlatformSettings;
  campaigns?: Campaign[];
  templates?: Template[];
  lists?: List[];
  segments?: Segment[];
  smtps?: SmtpServer[];
  logs?: SendLog[];
  tenants?: TenantSummary[];
  contacts?: { _id: string; email: string; name?: string }[];
  importStates?: Record<string, unknown>[];
}

/**
 * Dublê da API do mMail para os testes de interface.
 *
 * Mantém estado em memória (criar campanha realmente aparece na listagem seguinte),
 * grava as chamadas recebidas para asserção e permite forçar falhas por rota.
 */
export class ApiMock {
  user: AuthUser;
  campaigns: Campaign[];
  templates: Template[];
  lists: List[];
  segments: Segment[];
  smtps: SmtpServer[];
  logs: SendLog[];
  tenants: TenantSummary[];
  platformSettings: PlatformSettings;

  /**
   * Fila de respostas do job de importação, consumida a cada consulta de progresso.
   * A tela pergunta em intervalo curto; devolver uma sequência é o que permite testar
   * a transição validando → validado → importando → concluído sem cronômetro no teste.
   */
  importStates: Record<string, unknown>[] = [];
  contacts: { _id: string; email: string; name?: string }[] = [];

  /** Falhas forçadas, por apelido de rota (ex.: 'login', 'campaigns', 'saveCampaign'). */
  readonly failures = new Map<string, ApiFailure>();

  /** Toda requisição que chegou ao dublê, na ordem. */
  readonly calls: RecordedCall[] = [];

  constructor(seed: MockSeed = {}) {
    this.user = seed.user ?? ADMIN;
    this.campaigns = seed.campaigns ?? [];
    this.templates = seed.templates ?? [makeTemplate({ name: 'Boas vindas' })];
    this.lists = seed.lists ?? [makeList({ name: 'Clientes' })];
    this.segments = seed.segments ?? [];
    this.smtps = seed.smtps ?? [];
    this.logs = seed.logs ?? [];
    this.tenants = seed.tenants ?? [];
    this.contacts = seed.contacts ?? [];
    this.importStates = seed.importStates ?? [];
    this.platformSettings = seed.platformSettings ?? { ...DEFAULT_PLATFORM_SETTINGS };
  }

  /** Faz a rota falhar com o status e corpo informados. */
  fail(routeAlias: string, status: number, body: unknown): void {
    this.failures.set(routeAlias, { status, body });
  }

  callsTo(fragment: string): RecordedCall[] {
    return this.calls.filter((c) => c.path.includes(fragment));
  }

  lastCallTo(fragment: string): RecordedCall | undefined {
    return this.callsTo(fragment).at(-1);
  }

  async install(page: Page): Promise<void> {
    await page.route(`${API_ORIGIN}/api/**`, (route) => this.handle(route));
  }

  // ─── Roteamento ───

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const method = request.method();

    // O navegador dispara o preflight por causa do Authorization/X-Tenant-Id.
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
      return;
    }

    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    const query = Object.fromEntries(url.searchParams.entries());

    let body: Record<string, unknown> | null = null;
    try {
      body = (request.postDataJSON() as Record<string, unknown>) ?? null;
    } catch {
      body = null; // upload multipart ou corpo vazio
    }
    this.calls.push({ method, path, body, query });

    await this.dispatch(route, method, path, body ?? {}, query);
  }

  private async dispatch(
    route: Route,
    method: string,
    path: string,
    body: Record<string, unknown>,
    query: Record<string, string>
  ): Promise<void> {
    // ─── Autenticação ───
    if (method === 'POST' && path === '/auth/login') {
      if (await this.rejectIfFailing(route, 'login')) return;
      return this.json(route, { token: TEST_TOKEN, user: this.user });
    }
    if (method === 'GET' && path === '/auth/me') {
      if (await this.rejectIfFailing(route, 'me')) return;
      return this.json(route, this.user);
    }

    // ─── Contatos e importação em massa ───
    if (method === 'GET' && path === '/contacts') {
      if (await this.rejectIfFailing(route, 'contacts')) return;
      return this.json(route, { contacts: this.contacts, total: this.contacts.length, page: 1, limit: 50 });
    }
    if (method === 'GET' && path === '/contacts/import/open') {
      return this.json(route, []);
    }
    if (method === 'POST' && path === '/contacts/import') {
      if (await this.rejectIfFailing(route, 'startImport')) return;
      return this.json(route, { message: 'Arquivo recebido. Validando...', id: 'job-1', status: 'uploaded' }, 202);
    }
    if (method === 'GET' && path.startsWith('/contacts/import/')) {
      // Consome a fila; o último estado se repete, para a tela poder consultar de novo.
      const proximo = this.importStates.length > 1 ? this.importStates.shift() : this.importStates[0];
      return this.json(route, proximo ?? {});
    }
    if (method === 'POST' && path.endsWith('/confirm')) {
      if (await this.rejectIfFailing(route, 'confirmImport')) return;
      return this.json(route, { message: 'Importação iniciada.', id: 'job-1', status: 'importing' }, 202);
    }

    // ─── Dashboard ───
    if (method === 'GET' && path === '/dashboard/stats') {
      if (await this.rejectIfFailing(route, 'dashboardStats')) return;
      return this.json(route, this.dashboardStats());
    }
    if (method === 'GET' && path === '/dashboard/sends') {
      // Recorte vazio: as telas cobertas aqui não dependem do gráfico, só de ele não quebrar.
      return this.json(route, {
        de: new Date().toISOString(),
        ate: new Date().toISOString(),
        agrupamento: 'day',
        totais: { registros: 0, enviados: 0, abertos: 0, clicados: 0, falhas: 0, bounces: 0, descadastros: 0 },
        taxas: { abertura: 0, clique: 0, falha: 0 },
        serie: [],
      } satisfies RelatorioEnvios);
    }

    // ─── Apoios do formulário ───
    if (method === 'GET' && path === '/templates') return this.json(route, this.templates);
    if (method === 'POST' && path === '/templates/preview') {
      // O backend devolve o template renderizado — inclusive o que o usuário escreveu.
      return this.json(route, { html: String(body['html'] ?? ''), subject: String(body['subject'] ?? '') });
    }
    if (method === 'GET' && path === '/lists') return this.json(route, this.lists);
    if (method === 'GET' && path === '/segments') return this.json(route, this.segments);
    if (method === 'GET' && path === '/smtp') return this.json(route, this.smtps);
    if (method === 'GET' && path === '/tenants') return this.json(route, this.tenants);

    // ─── Motor de envio (plataforma) ───
    if (method === 'GET' && path === '/platform-settings') {
      if (await this.rejectIfFailing(route, 'platformSettings')) return;
      return this.json(route, this.platformSettings);
    }
    if (method === 'PUT' && path === '/platform-settings') {
      if (await this.rejectIfFailing(route, 'savePlatformSettings')) return;
      this.platformSettings = {
        ...this.platformSettings,
        workerConcurrency: Number(body['workerConcurrency']),
        ratePerMinute: Number(body['ratePerMinute']),
        updatedByEmail: this.user.email,
        updatedAt: ISO,
      };
      return this.json(route, {
        message: 'Ajustes do motor de envio atualizados.',
        settings: this.platformSettings,
      });
    }

    // ─── Campanhas ───
    if (method === 'GET' && path === '/campaigns') {
      if (await this.rejectIfFailing(route, 'campaigns')) return;
      return this.json(route, this.campaigns);
    }

    if (method === 'POST' && path === '/campaigns/save') {
      if (await this.rejectIfFailing(route, 'saveCampaign')) return;
      return this.json(route, this.saveCampaign(body));
    }

    const logsMatch = path.match(/^\/campaigns\/([^/]+)\/logs$/);
    if (method === 'GET' && logsMatch) {
      if (await this.rejectIfFailing(route, 'logs')) return;
      return this.sendLogs(route, query);
    }

    const actionMatch = path.match(/^\/campaigns\/([^/]+)\/(start|pause|resume|schedule|unschedule|test-email)$/);
    if (method === 'POST' && actionMatch) {
      const [, id, action] = actionMatch;
      if (await this.rejectIfFailing(route, action)) return;
      return this.json(route, this.runAction(id, action, body));
    }

    const oneMatch = path.match(/^\/campaigns\/([^/]+)$/);
    if (method === 'GET' && oneMatch) {
      const found = this.campaigns.find((c) => c._id === oneMatch[1]);
      if (!found) return this.error(route, 404, 'Campanha não encontrada.');
      return this.json(route, found);
    }
    if (method === 'DELETE' && oneMatch) {
      this.campaigns = this.campaigns.filter((c) => c._id !== oneMatch[1]);
      return this.json(route, null, 204);
    }

    // Rota não dublada: falha alto em vez de devolver algo silenciosamente errado.
    return this.error(route, 501, `Rota não dublada no ApiMock: ${method} ${path}`);
  }

  // ─── Regras ───

  private saveCampaign(body: Record<string, unknown>): { message: string; campaign: Campaign } {
    const id = body['id'] as string | undefined;

    if (id) {
      const index = this.campaigns.findIndex((c) => c._id === id);
      const updated = { ...this.campaigns[index], ...body, _id: id } as Campaign;
      this.campaigns[index] = updated;
      return { message: 'Campanha atualizada.', campaign: updated };
    }

    const created = makeCampaign({
      name: String(body['name']),
      _id: `c-nova-${this.campaigns.length + 1}`,
      templateId: String(body['templateId']),
      listIds: (body['listIds'] as string[]) ?? [],
      smtpId: (body['smtpId'] as string | null) ?? null,
      segmentId: (body['segmentId'] as string | null) ?? null,
    });
    this.campaigns = [created, ...this.campaigns];
    return { message: 'Campanha criada.', campaign: created };
  }

  private runAction(id: string, action: string, body: Record<string, unknown>): Record<string, unknown> {
    const campaign = this.campaigns.find((c) => c._id === id);
    if (!campaign) return { message: 'Campanha não encontrada.' };

    const setStatus = (status: CampaignStatus) => {
      campaign.status = status;
    };

    switch (action) {
      case 'start': {
        setStatus('sending');
        // Só para a tela ter progresso plausível quando o auto-refresh reler a lista.
        campaign.stats = { ...campaign.stats, total: 10, sent: 3 };
        return { message: '10 emails enfileirados.', queued: 10 };
      }
      case 'pause':
        setStatus('paused');
        return { message: 'Campanha pausada.' };
      case 'resume':
        setStatus('sending');
        return { message: 'Campanha retomada.' };
      case 'schedule':
        setStatus('scheduled');
        campaign.scheduledAt = String(body['scheduledAt']);
        return { message: 'Disparo agendado.' };
      case 'unschedule':
        setStatus('draft');
        campaign.scheduledAt = null;
        return { message: 'Agendamento cancelado.' };
      default:
        return { message: 'Email de teste enviado.' };
    }
  }

  private dashboardStats(): DashboardStats {
    return {
      totalContacts: 120,
      activeContacts: 118,
      totalLists: this.lists.length,
      totalCampaigns: this.campaigns.length,
      emailsSent: 340,
      openRate: 42,
      clickRate: 11,
      recentCampaigns: this.campaigns.slice(0, 3),
    };
  }

  // ─── Respostas ───

  private async sendLogs(route: Route, query: Record<string, string>): Promise<void> {
    const status = query['status'] ?? '';
    const filtered = status ? this.logs.filter((l) => l.status === status) : this.logs;
    const limit = Number(query['limit'] ?? 50);
    const page = Number(query['page'] ?? 1);
    const slice = filtered.slice((page - 1) * limit, page * limit);

    await route.fulfill({
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'content-type': 'application/json',
        'X-Total-Count': String(filtered.length),
        'X-Page': String(page),
        'X-Page-Size': String(limit),
      },
      body: JSON.stringify(slice),
    });
  }

  /** Aplica a falha programada para o apelido, se houver. Retorna true quando respondeu. */
  private async rejectIfFailing(route: Route, alias: string): Promise<boolean> {
    const failure = this.failures.get(alias);
    if (!failure) return false;
    await route.fulfill({
      status: failure.status,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify(failure.body),
    });
    return true;
  }

  private async json(route: Route, payload: unknown, status = 200): Promise<void> {
    await route.fulfill({
      status,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: payload === null ? '' : JSON.stringify(payload),
    });
  }

  private async error(route: Route, status: number, message: string): Promise<void> {
    await this.json(route, { message }, status);
  }
}

/**
 * Entra no painel sem passar pela tela de login — as chaves são as mesmas que o
 * AuthService grava (ver services/auth.service.ts). Use nos testes cujo alvo não é
 * o login em si; o fluxo real de login é coberto em login.spec.ts.
 */
export async function seedSession(page: Page, user: AuthUser = ADMIN): Promise<void> {
  await page.addInitScript(
    ([token, serializedUser, tenantId]) => {
      localStorage.setItem('mmail_token', token as string);
      localStorage.setItem('mmail_user', serializedUser as string);
      if (tenantId) {
        localStorage.setItem('mmail_tenant', tenantId as string);
        localStorage.setItem('mmail_tenant_name', 'Acme');
      }
    },
    [TEST_TOKEN, JSON.stringify(user), user.tenantId] as const
  );
}
