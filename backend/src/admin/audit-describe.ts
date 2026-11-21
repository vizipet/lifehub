/**
 * Transforma um registro de auditoria em frases para o painel do admin.
 * Ex.: SERVICE_UPDATED com changes.priceCents → "Valor: R$ 180,00 → R$ 250,00".
 */

export const ACTION_LABELS: Record<string, string> = {
  // Administração
  USER_BLOCKED: 'Bloqueou usuário',
  USER_UNBLOCKED: 'Desbloqueou usuário',
  CLINIC_APPROVED: 'Aprovou clínica',
  CLINIC_CHANGES_REQUESTED: 'Pediu correção de clínica',
  CLINIC_REJECTED: 'Rejeitou clínica',
  CLINIC_SUSPENDED: 'Suspendeu clínica',
  PROFESSIONAL_VERIFICATION_DECIDED: 'Decidiu cadastro de médico',
  VERIFICATION_DOCUMENT_ACCESS_GRANTED: 'Liberou acesso a documento de médico',
  VERIFICATION_DOCUMENT_CONTENT_ACCESSED: 'Abriu documento de médico',
  CAMPAIGN_CREATED: 'Criou campanha',
  CAMPAIGN_UPDATED: 'Editou campanha',
  CAMPAIGN_SUBMITTED: 'Enviou campanha para revisão',
  CAMPAIGN_PUBLISHED: 'Publicou campanha',
  CAMPAIGN_ARCHIVED: 'Arquivou campanha',
  CAMPAIGN_SOURCE_REVIEWED: 'Revisou fonte de campanha',
  // Médicos
  PROFESSIONAL_PROFILE_CREATED: 'Criou perfil profissional',
  PROFESSIONAL_PROFILE_UPDATED: 'Editou perfil profissional',
  PROFESSIONAL_CRM_CHANGED: 'Alterou o CRM (voltou para análise)',
  CLINIC_CREATED: 'Cadastrou local de atendimento',
  CLINIC_UPDATED: 'Editou local de atendimento',
  CLINIC_DOCUMENT_UPLOADED: 'Enviou documento do local',
  DEPENDENT_CREATED: 'Cadastrou dependente (declarou ser responsável)',
  DEPENDENT_LINK_CONFIRMED: 'Conferiu o vínculo do dependente',
  DEPENDENT_LINK_MISMATCH: 'Vínculo do dependente não conferiu',
  SAFETY_ALERT_RESOLVED: 'Resolveu alerta de dependente',
  CLINIC_DOCUMENT_OPENED: 'Abriu documento de local',
  VERIFICATION_DOCUMENT_UPLOADED: 'Enviou documento',
  VERIFICATION_SUBMITTED: 'Enviou cadastro para análise',
  SERVICE_CREATED: 'Criou serviço',
  SERVICE_UPDATED: 'Editou serviço',
  SERVICE_ACTIVATED: 'Ativou serviço',
  SERVICE_DEACTIVATED: 'Desativou serviço',
  SERVICE_DELETED: 'Excluiu serviço',
  SLOT_CREATED: 'Abriu um horário',
  SLOTS_OPENED: 'Abriu horários em lote',
  SLOT_BLOCKED: 'Bloqueou horário',
  SLOT_UNBLOCKED: 'Liberou horário bloqueado',
  APPOINTMENT_CANCELLED_BY_PROFESSIONAL: 'Cancelou consulta de paciente',
  APPOINTMENT_COMPLETED: 'Concluiu consulta',
};

/** Ações feitas por médicos (para o filtro "Médicos"). */
export const PROFESSIONAL_ACTIONS = [
  'PROFESSIONAL_PROFILE_CREATED',
  'PROFESSIONAL_PROFILE_UPDATED',
  'PROFESSIONAL_CRM_CHANGED',
  'CLINIC_CREATED',
  'CLINIC_UPDATED',
  'CLINIC_DOCUMENT_UPLOADED',
  'DEPENDENT_LINK_CONFIRMED',
  'DEPENDENT_LINK_MISMATCH',
  'VERIFICATION_DOCUMENT_UPLOADED',
  'VERIFICATION_SUBMITTED',
  'SERVICE_CREATED',
  'SERVICE_UPDATED',
  'SERVICE_ACTIVATED',
  'SERVICE_DEACTIVATED',
  'SERVICE_DELETED',
  'SLOT_CREATED',
  'SLOTS_OPENED',
  'SLOT_BLOCKED',
  'SLOT_UNBLOCKED',
  'APPOINTMENT_CANCELLED_BY_PROFESSIONAL',
  'APPOINTMENT_COMPLETED',
];

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição',
  modality: 'Modalidade',
  durationMinutes: 'Duração',
  priceCents: 'Valor',
  isActive: 'Situação',
  crm: 'CRM',
  crmState: 'UF do CRM',
  specialtyId: 'Especialidade',
  bio: 'Apresentação',
  address: 'Endereço',
  cnes: 'CNES',
  cep: 'CEP',
  city: 'Cidade',
  neighborhood: 'Bairro',
};

const TZ = 'America/Recife';

function money(value: unknown): string {
  return typeof value === 'number'
    ? (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'sem valor';
}

function when(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Converte qualquer valor salvo em texto legível (sem "[object Object]"). */
function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'vazio';
  if (field === 'priceCents') return money(value);
  if (field === 'durationMinutes') return `${text(value)} min`;
  if (field === 'modality') return value === 'REMOTE' ? 'teleconsulta' : 'presencial';
  if (field === 'isActive') return value ? 'ativo' : 'inativo';
  if (field === 'specialtyId') return 'outra especialidade';
  return text(value);
}

type Details = Record<string, unknown>;

/** Linhas de detalhe legíveis para o admin. */
export function describeAudit(action: string, details: unknown): string[] {
  const d = (details && typeof details === 'object' ? details : {}) as Details;
  const lines: string[] = [];

  if (typeof d.name === 'string' && action.startsWith('SERVICE_')) lines.push(`Serviço: ${d.name}`);

  if (action === 'SERVICE_CREATED' || action === 'SERVICE_DELETED') {
    lines.push(`${show('modality', d.modality)}, ${show('durationMinutes', d.durationMinutes)}, ${money(d.priceCents)}`);
  }

  if (d.changes && typeof d.changes === 'object') {
    for (const [field, change] of Object.entries(d.changes as Record<string, { from: unknown; to: unknown }>)) {
      lines.push(`${FIELD_LABELS[field] ?? field}: ${show(field, change.from)} → ${show(field, change.to)}`);
    }
  }

  if (action === 'SLOTS_OPENED') {
    lines.push(`${text(d.count)} horário(s), de ${when(d.from)} até ${when(d.to)}`);
  }
  if (action === 'SLOT_CREATED' || action === 'SLOT_BLOCKED' || action === 'SLOT_UNBLOCKED') {
    lines.push(`Horário de ${when(d.startsAt)}`);
  }
  if (action === 'APPOINTMENT_CANCELLED_BY_PROFESSIONAL') {
    lines.push(`Consulta de ${when(d.startsAt)}`);
  }
  if (action === 'CLINIC_CREATED') {
    lines.push(`${text(d.name)}: ${text(d.address)}, ${text(d.neighborhood)}, ${text(d.city)}`);
    if (d.cnes) lines.push(`CNES ${text(d.cnes)}`);
  }
  if (action.startsWith('CLINIC_') && action !== 'CLINIC_CREATED' && action !== 'CLINIC_UPDATED' && d.cnes) {
    lines.push(`CNES ${text(d.cnes)}`);
  }
  if (d.checklist && typeof d.checklist === 'object') {
    const c = d.checklist as Record<string, unknown>;
    const done = [
      c.cnesChecked && 'CNES conferido',
      c.addressMatches && 'endereço confere',
      c.professionalListed && 'médico consta no CNES',
      c.documentChecked && 'documento conferido',
    ].filter(Boolean);
    lines.push(`Conferência: ${done.join(', ')}`);
  }
  if (action === 'CLINIC_UPDATED' && d.backToReview) {
    lines.push('A clínica voltou para análise do administrador.');
  }
  if (action === 'PROFESSIONAL_PROFILE_CREATED') {
    lines.push(`CRM ${text(d.crm)}/${text(d.crmState)}${d.specialty ? `, ${text(d.specialty)}` : ''}`);
  }
  if ((action === 'CLINIC_DOCUMENT_UPLOADED' || action === 'CLINIC_DOCUMENT_OPENED') && typeof d.originalName === 'string') {
    lines.push(`Arquivo: ${d.originalName}${typeof d.clinicName === 'string' ? ` (${d.clinicName})` : ''}`);
  }
  if (action === 'VERIFICATION_DOCUMENT_UPLOADED' && typeof d.originalName === 'string') {
    lines.push(`Arquivo: ${d.originalName}`);
  }
  if (action === 'PROFESSIONAL_VERIFICATION_DECIDED' && typeof d.decision === 'string') {
    lines.push(`Decisão: ${d.decision}`);
  }
  return lines;
}
