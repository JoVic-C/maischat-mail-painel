/** Datas chegam como string ISO e ObjectId como string (JSON): nada de Date/ObjectId aqui. */

export type UserRole = 'superadmin' | 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** null para superadmin, que não pertence a nenhum cliente. */
  tenantId: string | null;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Exclude<UserRole, 'superadmin'>;
  isActive: boolean;
  createdAt?: string;
  /** true enquanto a pessoa não definiu a senha pelo link de convite. */
  pendingInvite?: boolean;
}

/** Link de convite devolvido ao admin — permite repassar por outro canal se o email não sair. */
export interface InviteLink {
  url: string;
  expiresAt: string;
  emailSent?: boolean;
}

/** Link de redefinição gerado pelo painel, para repasse quando o email não sai. */
export interface ResetLink {
  url: string;
  expiresAt: string;
  emailSent?: boolean;
}

export interface InvitePreview {
  email: string;
  name: string;
  tenantName: string | null;
}

export interface SaveUserInput {
  id?: string;
  email: string;
  name?: string;
  password?: string;
  role?: Exclude<UserRole, 'superadmin'>;
  isActive?: boolean;
}

/** 0 = sem limite próprio. */
export interface SendingLimits {
  concurrency: number;
  ratePerMinute: number;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sendingLimits: SendingLimits;
  users: number;
  contacts: number;
  lists: number;
  campaigns: number;
}

export interface UpdateTenantInput {
  name?: string;
  isActive?: boolean;
  sendingLimits?: Partial<SendingLimits>;
}

export interface TenantWelcome {
  url: string;
  expiresAt: string;
  /** `reset` quando o superadmin definiu a senha; `invite` quando o admin vai criá-la. */
  kind: 'invite' | 'reset';
  emailSent: boolean;
}

/** Retorno da criação de cliente. O link volta para repasse manual se o email não sair. */
export interface CreateTenantResult {
  id: string;
  slug: string;
  adminEmail: string;
  welcome?: TenantWelcome;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
  adminEmail: string;
  /** Não usada pelo painel; existe para scripts e provisionamento automatizado. */
  adminPassword?: string;
  adminName?: string;
}

/** Vale para a plataforma inteira, por isso só o superadmin lê e escreve. */
export interface PlatformSettings {
  /** Envios simultâneos do worker; recurso compartilhado por todos os clientes. */
  workerConcurrency: number;
  ratePerMinute: number;
  updatedByEmail: string;
  updatedAt: string | null;
  /** Faixas aceitas pelo backend — a tela usa estas, em vez de repetir os números. */
  bounds: {
    workerConcurrency: { min: number; max: number };
    ratePerMinute: { min: number; max: number };
  };
}

export interface SavePlatformSettingsInput {
  workerConcurrency: number;
  ratePerMinute: number;
}

export type ListType = 'public' | 'private';

export interface List {
  _id: string;
  name: string;
  description: string;
  type: ListType;
  tags: string[];
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveListInput {
  id?: string;
  name: string;
  description?: string;
  type?: ListType;
  tags?: string[];
}

export type ContactStatus = 'active' | 'unsubscribed' | 'bounced';
export type DeliveryFilter = '' | 'delivered' | 'never' | 'undeliverable';

export interface Contact {
  _id: string;
  email: string;
  name: string;
  phone: string;
  company: string;
  lists: string[];
  status: ContactStatus;
  unsubscribedAt: string | null;
  lastDeliveredAt: string | null;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPage {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
}

export interface SaveContactInput {
  id?: string;
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  lists?: string[];
  status?: ContactStatus;
  metadata?: Record<string, string>;
}

export interface ContactQuery {
  search?: string;
  listId?: string;
  status?: ContactStatus | '';
  delivery?: DeliveryFilter;
  page?: number;
  limit?: number;
}

export type RowKind = 'new' | 'add-to-list' | 'in-list' | 'already' | 'invalid';

export type ImportStatus = 'uploaded' | 'validating' | 'validated' | 'importing' | 'done' | 'failed' | 'canceled';

export interface ImportCounters {
  rows: number;
  new: number;
  addToList: number;
  inList: number;
  already: number;
  invalid: number;
}

export interface ImportSampleRow {
  email: string;
  kind: RowKind;
  reason?: string;
}

export interface ImportJob {
  id: string;
  status: ImportStatus;
  originalName: string;
  sizeBytes: number;
  listIds: string[];
  counters: ImportCounters;
  imported: number;
  skipped: number;
  sample: ImportSampleRow[];
  error: string;
  createdAt: string;
}

/** Importação ainda aberta, para retomar após recarregar a página. */
export interface OpenImport {
  id: string;
  status: ImportStatus;
  originalName: string;
  createdAt: string;
}

export interface Template {
  _id: string;
  name: string;
  subject: string;
  html: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveTemplateInput {
  id?: string;
  name: string;
  subject: string;
  html: string;
}

export type SegmentOperator = 'equals' | 'contains';

export interface SegmentRule {
  field: string;
  operator: SegmentOperator;
  value: string;
}

export interface Segment {
  _id: string;
  name: string;
  rules: SegmentRule[];
  matchAll: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSegmentInput {
  id?: string;
  name: string;
  rules: SegmentRule[];
  matchAll: boolean;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'paused' | 'completed' | 'failed';

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface LinkStat {
  url: string;
  clicks: number;
}

export interface CampaignAttachment {
  filename: string;
  storedName: string;
  size: number;
}

export interface Campaign {
  _id: string;
  name: string;
  templateId: string;
  listIds: string[];
  smtpId: string | null;
  segmentId: string | null;
  status: CampaignStatus;
  /** Por que a campanha parou sozinha; nulo quando foi pausada pelo usuário. */
  pauseReason?: string | null;
  stats: CampaignStats;
  linkStats: LinkStat[];
  attachments: CampaignAttachment[];
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCampaignInput {
  id?: string;
  name: string;
  templateId: string;
  listIds: string[];
  smtpId: string | null;
  segmentId: string | null;
  attachments: CampaignAttachment[];
}

export type SendStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'opened' | 'clicked' | 'unsubscribed';

export interface SendLog {
  _id: string;
  campaignId: string;
  contactId: string;
  email: string;
  status: SendStatus;
  error: string;
  messageId: string;
  openCount: number;
  clickCount: number;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  createdAt: string;
}

/** Os logs vêm no corpo e a paginação nos headers X-Total-Count / X-Page / X-Page-Size. */
export interface SendLogPage {
  logs: SendLog[];
  total: number;
  page: number;
  limit: number;
}

export type DnsCheck = 'spf' | 'dkim' | 'dmarc';
export type DnsCheckState = 'pass' | 'fail' | 'error';

export interface SendingDomainCheck {
  state: DnsCheckState;
  detail: string;
}

export interface DnsRecordHint {
  check: DnsCheck;
  type: 'TXT' | 'CNAME';
  host: string;
  value: string | null;
  note: string;
}

export interface SendingDomain {
  domain: string;
  smtpNames: string[];
  status: 'verified' | 'unverified';
  checks: Record<DnsCheck, SendingDomainCheck> | null;
  checkedAt: string | null;
  verifiedAt: string | null;
  records: DnsRecordHint[];
}

export interface SendingDomainsOverview {
  enforced: boolean;
  platformHosts: string[];
  domains: SendingDomain[];
}

export interface SmtpServer {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
  dailyLimit: number;
  hourlyLimit: number;
}

export interface SaveSmtpInput {
  id?: string;
  name: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  /** Na edição, vazio = manter a senha atual. */
  password?: string;
  fromName: string;
  fromEmail: string;
  isDefault?: boolean;
  dailyLimit?: number;
  hourlyLimit?: number;
}

export interface SmtpCredentials {
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  password: string;
}

export interface DashboardStats {
  totalContacts: number;
  activeContacts: number;
  totalLists: number;
  totalCampaigns: number;
  emailsSent: number;
  openRate: number;
  clickRate: number;
  recentCampaigns: Campaign[];
}

export type Agrupamento = 'day' | 'week' | 'month';

export interface TotaisEnvio {
  /** Linhas de envio no período — inclui as que ainda não saíram. */
  registros: number;
  enviados: number;
  abertos: number;
  clicados: number;
  falhas: number;
  bounces: number;
  descadastros: number;
}

export interface PontoEnvio extends TotaisEnvio {
  /** Início do balde, em ISO. O rótulo é montado na tela. */
  inicio: string;
}

export interface RelatorioEnvios {
  de: string;
  ate: string;
  agrupamento: Agrupamento;
  totais: TotaisEnvio;
  taxas: { abertura: number; clique: number; falha: number };
  serie: PontoEnvio[];
}

export interface ApiMessage {
  message: string;
}

export interface UploadedImage {
  url: string;
}

export interface QueueState {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  scheduled: number;
}

export interface TenantActivity {
  tenantId: string;
  name: string;
  slug: string;
  isActive: boolean;
  sent: number;
  failed: number;
  bounced: number;
  sending: number;
  paused: number;
}

export interface PlatformOverview {
  queue: QueueState;
  tenants: TenantActivity[];
}

/** Linha de falha detalhada — contém endereço de destinatário (dado do cliente). */
export interface FailureRow {
  tenantName: string;
  campaignId: string;
  email: string;
  status: string;
  error: string;
  at: string;
}
