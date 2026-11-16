import { CampaignStatus, ContactStatus, ListType, SendStatus, UserRole, VerificationStatus } from './interfaces';

/** Classe visual do badge — mapeia para `.badge.<cls>` do design system. */
export type BadgeClass = 'green' | 'red' | 'yellow' | 'purple' | 'gray';

export interface BadgeInfo {
  label: string;
  cls: BadgeClass;
  hint?: string;
}

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, BadgeInfo> = {
  draft: { label: 'Rascunho', cls: 'gray', hint: 'Ainda não foi disparada.' },
  scheduled: { label: 'Agendada', cls: 'yellow', hint: 'Vai disparar sozinha na data marcada.' },
  queued: { label: 'Na fila', cls: 'purple', hint: 'Os emails estão entrando na fila de envio.' },
  sending: { label: 'Enviando', cls: 'purple', hint: 'Disparo em andamento.' },
  paused: { label: 'Pausada', cls: 'yellow', hint: 'Envio interrompido — pode ser retomado.' },
  completed: { label: 'Concluída', cls: 'green', hint: 'Todos os envios foram processados.' },
  failed: { label: 'Falhou', cls: 'red', hint: 'O disparo não pôde ser concluído.' },
};

export const CONTACT_STATUS_LABELS: Record<ContactStatus, BadgeInfo> = {
  active: { label: 'Ativo', cls: 'green', hint: 'Recebe campanhas normalmente.' },
  unsubscribed: {
    label: 'Descadastrado',
    cls: 'yellow',
    hint: 'Cancelou a inscrição — não recebe mais campanhas.',
  },
  bounced: {
    label: 'Inválido (bounce)',
    cls: 'red',
    hint: 'O email voltou (endereço inexistente ou caixa cheia). Não recebe mais campanhas para proteger a reputação de envio.',
  },
};

export const SEND_STATUS_LABELS: Record<SendStatus, BadgeInfo> = {
  pending: { label: 'Pendente', cls: 'gray' },
  sent: { label: 'Entregue', cls: 'green' },
  opened: { label: 'Aberto', cls: 'green' },
  clicked: { label: 'Clicado', cls: 'purple' },
  failed: { label: 'Falhou', cls: 'red' },
  bounced: { label: 'Bounce', cls: 'red' },
  unsubscribed: { label: 'Descadastrou', cls: 'yellow' },
};

export const LIST_TYPE_LABELS: Record<ListType, BadgeInfo> = {
  public: { label: 'Pública', cls: 'green' },
  private: { label: 'Privada', cls: 'gray' },
};

export const USER_ROLE_LABELS: Record<UserRole, BadgeInfo> = {
  superadmin: { label: 'Administrador da plataforma', cls: 'purple' },
  admin: { label: 'Administrador', cls: 'purple', hint: 'Gerencia equipe, SMTP e bounces.' },
  user: { label: 'Usuário', cls: 'gray', hint: 'Opera contatos, listas, templates e campanhas.' },
};

export const ACTIVE_LABELS: Record<'active' | 'inactive', BadgeInfo> = {
  active: { label: 'Ativo', cls: 'green' },
  inactive: { label: 'Desativado', cls: 'red' },
};

export const MATCH_LABELS: Record<'all' | 'any', BadgeInfo> = {
  all: { label: 'Todas (E)', cls: 'purple' },
  any: { label: 'Qualquer (OU)', cls: 'gray' },
};

/** Espelha a whitelist do backend. */
export const SEGMENT_FIELD_LABELS: Record<string, string> = {
  company: 'Empresa',
  name: 'Nome',
  email: 'Email',
  status: 'Status',
  'metadata.plano': 'Plano (metadata)',
};

export const CSV_ROW_LABELS: Record<string, BadgeInfo> = {
  new: { label: '✅ novo', cls: 'green' },
  'add-to-list': { label: '➕ + à lista', cls: 'yellow' },
  'in-list': { label: '⏭️ já na lista', cls: 'gray' },
  already: { label: '⏭️ já cadastrado', cls: 'gray' },
  invalid: { label: '❌ inválido', cls: 'red' },
};

export const VERIFICATION_LABELS: Record<VerificationStatus, BadgeInfo> = {
  deliverable: { label: 'Válido', cls: 'green', hint: 'A caixa postal existe e recebe emails.' },
  undeliverable: {
    label: 'Reprovado',
    cls: 'red',
    hint: 'A caixa postal não existe ou prejudicaria a reputação. Não recebe campanhas.',
  },
  risky: {
    label: 'Arriscado',
    cls: 'yellow',
    hint: 'Domínio que aceita qualquer endereço ou email temporário. Recebe campanhas, mas pode voltar.',
  },
  unknown: { label: 'Inconclusivo', cls: 'gray', hint: 'O servidor do destino não permitiu confirmar.' },
};

/**
 * Motivo de cada resultado da EmailListVerify, espelho do `ELV_REASON` do backend. O status
 * agrupa (ex.: "Arriscado"); o resultado diz por quê (email temporário ≠ aceita qualquer endereço).
 * `tag` só existe onde o motivo muda a decisão de quem lê a lista.
 */
const VERIFICATION_RESULTS: Record<string, { reason: string; tag?: string }> = {
  ok: { reason: 'Caixa postal válida' },
  email_disabled: { reason: 'Caixa postal não existe ou está desativada', tag: 'Caixa inexistente' },
  dead_server: { reason: 'Domínio não existe ou não recebe emails', tag: 'Domínio sem email' },
  invalid_mx: { reason: 'Servidor de email do domínio mal configurado', tag: 'MX mal configurado' },
  invalid_syntax: { reason: 'Endereço com formato inválido', tag: 'Formato inválido' },
  spamtrap: { reason: 'Armadilha de spam: enviar prejudica a reputação', tag: 'Armadilha de spam' },
  ok_for_all: { reason: 'Domínio aceita qualquer endereço; a caixa não pôde ser confirmada', tag: 'Aceita qualquer endereço' },
  disposable: { reason: 'Email temporário (descartável): dificilmente vai abrir ou clicar', tag: 'Email temporário' },
  antispam_system: { reason: 'O antispam do destino impediu a verificação', tag: 'Bloqueado pelo antispam' },
  // Marcação do detector de erro de digitação, não do provedor.
  typo_suspected: {
    reason: 'Possível erro de digitação no domínio: fica fora das campanhas até a revisão',
    tag: 'Erro de digitação?',
  },
};

const UNKNOWN_RESULT_REASON = 'Não foi possível verificar';

export function verificationResultReason(result: string | null | undefined): string {
  return VERIFICATION_RESULTS[(result ?? '').trim().toLowerCase()]?.reason ?? UNKNOWN_RESULT_REASON;
}

export function verificationResultTag(result: string | null | undefined): string | null {
  return VERIFICATION_RESULTS[(result ?? '').trim().toLowerCase()]?.tag ?? null;
}
