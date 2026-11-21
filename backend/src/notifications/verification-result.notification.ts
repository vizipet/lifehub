import { PrismaService } from '../common/prisma/prisma.service';
import { isVerificationDecision, PROFESSIONAL_VERIFICATION_DECIDED } from './verification-decision.event';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_VERIFICATION_EVENT');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('INVALID_VERIFICATION_EVENT');
  return value;
}

export async function createVerificationResultNotification(prisma: PrismaService, payload: unknown) {
  const data = object(payload);
  const decisionId = id(data.decisionId);
  const professionalId = id(data.professionalId);
  const recipientId = id(data.recipientId);
  if (!isVerificationDecision(data.decision) || typeof data.submittedAt !== 'string') {
    throw new Error('INVALID_VERIFICATION_EVENT');
  }
  const audit = await prisma.auditLog.findUnique({
    where: { id: decisionId },
    select: { action: true, entityType: true, entityId: true, reason: true, details: true },
  });
  if (!audit || audit.action !== PROFESSIONAL_VERIFICATION_DECIDED ||
      audit.entityType !== 'PROFESSIONAL' || audit.entityId !== professionalId || !audit.reason?.trim()) {
    throw new Error('VERIFICATION_DECISION_AUDIT_REQUIRED');
  }
  const details = object(audit.details);
  if (details.professionalId !== professionalId || details.recipientId !== recipientId ||
      details.toStatus !== data.decision || details.submittedAt !== data.submittedAt) {
    throw new Error('VERIFICATION_DECISION_EVENT_MISMATCH');
  }
  const content = {
    APPROVED: { title: 'Verificação aprovada', text: 'Seu perfil profissional foi aprovado.' },
    CHANGES_REQUESTED: { title: 'Correção de verificação solicitada', text: 'Seu perfil profissional precisa de correções.' },
    REJECTED: { title: 'Verificação rejeitada', text: 'A verificação do seu perfil profissional foi rejeitada.' },
  }[data.decision];
  // Deduplica pela decisão persistida, inclusive se outro envelope Outbox repetir
  // a mesma decisão. Não confunde uma decisão antiga com o estado atual do perfil.
  const deduplicationKey = `${PROFESSIONAL_VERIFICATION_DECIDED}:${decisionId}:${recipientId}`;
  try {
    return await prisma.notification.upsert({
      where: { deduplicationKey }, update: {},
      create: {
        userId: recipientId, type: PROFESSIONAL_VERIFICATION_DECIDED,
        title: content.title, message: `${content.text} Motivo: ${audit.reason.trim()}`,
        deduplicationKey,
      },
    });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') {
      throw error;
    }
    // Outro consumidor pode inserir entre a consulta e a criação do upsert.
    // Recupera apenas a mesma chave; ausência ou erro de leitura continuam falhando.
    return prisma.notification.findUniqueOrThrow({ where: { deduplicationKey } });
  }
}
