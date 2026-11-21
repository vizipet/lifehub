import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { PROFESSIONAL_VERIFICATION_DECIDED, VERIFICATION_DECISIONS } from './verification-decision.event';

describe('Notificação de resultado de verificação', () => {
  const decisionId = '11111111-1111-4111-8111-111111111111';
  const professionalId = '22222222-2222-4222-8222-222222222222';
  const recipientId = '33333333-3333-4333-8333-333333333333';
  const submittedAt = '2026-10-18T12:00:00.000Z';
  const db = { auditLog: { findUnique: jest.fn() }, notification: { upsert: jest.fn(), findUniqueOrThrow: jest.fn() } };
  const service = new NotificationsService(db as unknown as PrismaService);
  const payload = { decisionId, professionalId, recipientId, decision: 'APPROVED', submittedAt };
  const consume = (data: unknown = payload, eventId = 'event-test') => service.createFromOutboxEvent({
    id: eventId, type: PROFESSIONAL_VERIFICATION_DECIDED, payload: data,
  });
  function audit(decision = 'APPROVED') {
    return {
      action: PROFESSIONAL_VERIFICATION_DECIDED, entityType: 'PROFESSIONAL', entityId: professionalId,
      reason: 'Análise concluída.', details: { professionalId, recipientId, toStatus: decision, submittedAt },
    };
  }
  beforeEach(() => {
    jest.resetAllMocks();
    db.auditLog.findUnique.mockResolvedValue(audit());
    db.notification.upsert.mockResolvedValue({ id: 'notification-test' });
  });
  it.each(VERIFICATION_DECISIONS)('notifica somente o destinatário auditado da decisão %s', async (decision) => {
    db.auditLog.findUnique.mockResolvedValueOnce(audit(decision));
    await consume({ ...payload, decision });
    expect(db.notification.upsert).toHaveBeenCalledWith({
      where: { deduplicationKey: `${PROFESSIONAL_VERIFICATION_DECIDED}:${decisionId}:${recipientId}` }, update: {},
      create: expect.objectContaining({ userId: recipientId, type: PROFESSIONAL_VERIFICATION_DECIDED, message: expect.stringContaining('Análise concluída.') }),
    });
  });
  it('deduplica por decisão mesmo em envelopes Outbox diferentes', async () => {
    await consume(payload, 'first-envelope');
    await consume(payload, 'second-envelope');
    expect(db.notification.upsert.mock.calls[0][0]).toEqual(db.notification.upsert.mock.calls[1][0]);
  });
  it('recupera a notificação vencedora da mesma chave quando o upsert perde a corrida', async () => {
    const existing = { id: 'winner-notification', userId: recipientId, readAt: new Date(), emailSentAt: new Date() };
    db.notification.upsert.mockRejectedValueOnce({ code: 'P2002' });
    db.notification.findUniqueOrThrow.mockResolvedValueOnce(existing);
    await expect(consume()).resolves.toBe(existing);
    expect(db.notification.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { deduplicationKey: `${PROFESSIONAL_VERIFICATION_DECIDED}:${decisionId}:${recipientId}` },
    });
    expect(db.notification.upsert).toHaveBeenCalledTimes(1);
  });
  it('propaga falha diferente de P2002 sem recuperar uma notificação', async () => {
    const failure = new Error('database unavailable');
    db.notification.upsert.mockRejectedValueOnce(failure);
    await expect(consume()).rejects.toBe(failure);
    expect(db.notification.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('não considera P2002 sucesso se a notificação da mesma chave não puder ser lida', async () => {
    const failure = new Error('notification not found');
    db.notification.upsert.mockRejectedValueOnce({ code: 'P2002' });
    db.notification.findUniqueOrThrow.mockRejectedValueOnce(failure);
    await expect(consume()).rejects.toBe(failure);
  });
  it('recusa decisão inexistente na auditoria', async () => {
    db.auditLog.findUnique.mockResolvedValueOnce(null);
    await expect(consume()).rejects.toThrow('VERIFICATION_DECISION_AUDIT_REQUIRED');
    expect(db.notification.upsert).not.toHaveBeenCalled();
  });
  it.each([
    { recipientId: '44444444-4444-4444-8444-444444444444' },
    { professionalId: '44444444-4444-4444-8444-444444444444' },
    { decision: 'REJECTED' }, { submittedAt: '2020-01-01T00:00:00.000Z' },
  ])('recusa payload divergente da decisão auditada: %s', async (changed) => {
    await expect(consume({ ...payload, ...changed })).rejects.toThrow();
    expect(db.notification.upsert).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ...payload, decisionId: 'invalid' }, { ...payload, decision: 'PENDING' }])(
    'recusa payload inválido: %s', async (data) => {
      await expect(consume(data)).rejects.toThrow('INVALID_VERIFICATION_EVENT');
      expect(db.notification.upsert).not.toHaveBeenCalled();
    },
  );
  it('não usa motivo injetado no evento em lugar da auditoria', async () => {
    await consume({ ...payload, reason: 'Não usar este texto.' });
    expect(db.notification.upsert.mock.calls[0][0].create.message).not.toContain('Não usar este texto.');
  });
});
