import { CampaignStatus, ContactStatus, ListType, SendStatus, UserRole } from './interfaces';

/** Classe visual do badge — mapeia para `.badge.<cls>` do design system. */
export type BadgeClass = 'green' | 'red' | 'yellow' | 'purple' | 'gray';

export interface BadgeInfo {
  label: string;
  cls: BadgeClass;
  /** Texto do tooltip, quando o status merece explicação. */
  hint?: string;
}

/** Situação de uma campanha. */
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, BadgeInfo> = {
  draft: { label: 'Rascunho', cls: 'gray', hint: 'Ainda não foi disparada.' },
  scheduled: { label: 'Agendada', cls: 'yellow', hint: 'Vai disparar sozinha na data marcada.' },
  queued: { label: 'Na fila', cls: 'purple', hint: 'Os emails estão entrando na fila de envio.' },
  sending: { label: 'Enviando', cls: 'purple', hint: 'Disparo em andamento.' },
  paused: { label: 'Pausada', cls: 'yellow', hint: 'Envio interrompido — pode ser retomado.' },
  completed: { label: 'Concluída', cls: 'green', hint: 'Todos os envios foram processados.' },
  failed: { label: 'Falhou', cls: 'red', hint: 'O disparo não pôde ser concluído.' },
};

/** Situação de um contato na base. */
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

/** Situação de um envio individual (SendLog). */
export const SEND_STATUS_LABELS: Record<SendStatus, BadgeInfo> = {
  pending: { label: 'Pendente', cls: 'gray' },
  sent: { label: 'Entregue', cls: 'green' },
  opened: { label: 'Aberto', cls: 'green' },
  clicked: { label: 'Clicado', cls: 'purple' },
  failed: { label: 'Falhou', cls: 'red' },
  bounced: { label: 'Bounce', cls: 'red' },
  unsubscribed: { label: 'Descadastrou', cls: 'yellow' },
};

/** Visibilidade de uma lista. */
export const LIST_TYPE_LABELS: Record<ListType, BadgeInfo> = {
  public: { label: 'Pública', cls: 'green' },
  private: { label: 'Privada', cls: 'gray' },
};

/** Papel do usuário no painel. */
export const USER_ROLE_LABELS: Record<UserRole, BadgeInfo> = {
  superadmin: { label: 'Administrador da plataforma', cls: 'purple' },
  admin: { label: 'Administrador', cls: 'purple', hint: 'Gerencia equipe, SMTP e bounces.' },
  user: { label: 'Usuário', cls: 'gray', hint: 'Opera contatos, listas, templates e campanhas.' },
};

/** Conta/cliente ativo ou bloqueado. */
export const ACTIVE_LABELS: Record<'active' | 'inactive', BadgeInfo> = {
  active: { label: 'Ativo', cls: 'green' },
  inactive: { label: 'Desativado', cls: 'red' },
};

/** Combinação de regras de um segmento. */
export const MATCH_LABELS: Record<'all' | 'any', BadgeInfo> = {
  all: { label: 'Todas (E)', cls: 'purple' },
  any: { label: 'Qualquer (OU)', cls: 'gray' },
};

/** Campos que uma regra de segmento pode filtrar — espelha a whitelist do backend. */
export const SEGMENT_FIELD_LABELS: Record<string, string> = {
  company: 'Empresa',
  name: 'Nome',
  email: 'Email',
  status: 'Status',
  'metadata.plano': 'Plano (metadata)',
};

/** Classificação de cada linha na validação do CSV. */
export const CSV_ROW_LABELS: Record<string, BadgeInfo> = {
  new: { label: '✅ novo', cls: 'green' },
  'add-to-list': { label: '➕ + à lista', cls: 'yellow' },
  'in-list': { label: '⏭️ já na lista', cls: 'gray' },
  already: { label: '⏭️ já cadastrado', cls: 'gray' },
  invalid: { label: '❌ inválido', cls: 'red' },
};
