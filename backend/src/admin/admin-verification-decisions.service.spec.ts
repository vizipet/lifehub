import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, UserRole, UserStatus, VerificationStatus } from '../generated/prisma/client';
import { PROFESSIONAL_VERIFICATION_DECIDED, VERIFICATION_DECISIONS } from '../notifications/verification-decision.event';
import { AdminVerificationDecisionsService } from './admin-verification-decisions.service';
import { DecideVerificationDto } from './dto/decide-verification.dto';

describe('AdminVerificationDecisionsService', () => {
  const actorId = 'admin-test';
  const professionalId = 'profile-test';
  const recipientId = 'professional-user-test';
  const date = new Date('2026-10-18T12:00:00.000Z');
  const tx = {
    user: { findUnique: jest.fn() }, authSession: { findFirst: jest.fn() },
    professional: { findUnique: jest.fn(), updateMany: jest.fn() }, auditLog: { create: jest.fn() },
  };
  const db = { $transaction: jest.fn() };
  const outbox = { emitOutbox: jest.fn() };
  let service: AdminVerificationDecisionsService;
  let profile: {
    id: string; userId: string; verificationStatus: VerificationStatus; verificationSubmittedAt: Date | null;
    updatedAt: Date; crm: string | null; crmState: string | null; specialtyId: string | null;
    user: { name: string; email: string; phone: string; role: UserRole; status: UserStatus };
    _count: { verificationDocuments: number };
  };
  const input = (decision: DecideVerificationDto['decision'] = 'APPROVED'): DecideVerificationDto => ({
    decision, reason: '  Análise administrativa.  ', expectedSubmittedAt: date.toISOString(),
  });
  const decide = (dto = input()) => service.decide(actorId, 'session-test', professionalId, dto);

  beforeEach(() => {
    jest.resetAllMocks();
    profile = {
      id: professionalId, userId: recipientId, verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: date, updatedAt: date, crm: '123456', crmState: 'PE', specialtyId: 'specialty-id',
      user: { name: 'Profissional teste', email: 'professional@lifehub.test', phone: '81999990001', role: UserRole.PROFESSIONAL, status: UserStatus.ACTIVE },
      _count: { verificationDocuments: 1 },
    };
    tx.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN, status: UserStatus.ACTIVE });
    tx.authSession.findFirst.mockResolvedValue({ id: 'session-test' });
    tx.professional.findUnique.mockImplementation(async () => profile);
    tx.professional.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({ id: 'decision-test', createdAt: date });
    outbox.emitOutbox.mockResolvedValue(undefined);
    db.$transaction.mockImplementation(async (fn: (transaction: Prisma.TransactionClient) => Promise<unknown>) => fn(tx as unknown as Prisma.TransactionClient));
    const prisma = db as unknown as PrismaService;
    service = new AdminVerificationDecisionsService(prisma, new AuditService(prisma), outbox);
  });

  it.each(VERIFICATION_DECISIONS)('grava decisão %s, auditoria e evento usando a mesma transação', async (decision) => {
    await expect(decide(input(decision))).resolves.toEqual({ data: {
      decisionId: 'decision-test', professionalId, status: decision, reason: 'Análise administrativa.',
      decidedAt: date.toISOString(), submittedAt: date.toISOString(),
    } });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    expect(tx.professional.updateMany).toHaveBeenCalledWith({
      where: { id: professionalId, verificationStatus: VerificationStatus.PENDING, verificationSubmittedAt: date, updatedAt: date },
      data: { verificationStatus: decision },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      actorId, reason: 'Análise administrativa.', action: PROFESSIONAL_VERIFICATION_DECIDED,
      entityType: 'PROFESSIONAL', entityId: professionalId,
    }) }));
    expect(outbox.emitOutbox).toHaveBeenCalledWith({ type: PROFESSIONAL_VERIFICATION_DECIDED, payload: {
      decisionId: 'decision-test', professionalId, recipientId, decision, submittedAt: date.toISOString(),
    } }, tx);
  });
  it.each([UserRole.PATIENT, UserRole.PROFESSIONAL])('nega papel atual %s', async (role) => {
    tx.user.findUnique.mockResolvedValue({ role, status: UserStatus.ACTIVE });
    await expect(decide()).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
  });
  it('nega conta administrativa bloqueada', async () => {
    tx.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN, status: UserStatus.BLOCKED });
    await expect(decide()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('nega sessão inválida conferida na transação', async () => {
    tx.authSession.findFirst.mockResolvedValue(null);
    await expect(decide()).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('retorna 404 para perfil inexistente', async () => {
    tx.professional.findUnique.mockResolvedValueOnce(null);
    await expect(decide()).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each([VerificationStatus.APPROVED, VerificationStatus.CHANGES_REQUESTED, VerificationStatus.REJECTED, VerificationStatus.SUSPENDED])(
    'não decide novamente estado %s', async (status) => {
      profile.verificationStatus = status;
      await expect(decide()).rejects.toBeInstanceOf(ConflictException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it('não decide rascunho não enviado', async () => {
    profile.verificationSubmittedAt = null;
    await expect(decide()).rejects.toBeInstanceOf(ConflictException);
  });
  it('recusa data de submissão antiga', async () => {
    const dto = input();
    dto.expectedSubmittedAt = new Date(0).toISOString();
    await expect(decide(dto)).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['name', 'email', 'phone'] as const)('não aprova perfil sem %s', async (field) => {
    profile.user[field] = '   ';
    await expect(decide()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.professional.updateMany).not.toHaveBeenCalled();
  });
  it('não aprova sem documentos', async () => {
    profile._count.verificationDocuments = 0;
    await expect(decide()).rejects.toBeInstanceOf(BadRequestException);
  });
  it('não aprova CRM sem UF', async () => {
    profile.crmState = null;
    await expect(decide()).rejects.toBeInstanceOf(BadRequestException);
  });
  it('não aprova médico sem CRM', async () => {
    profile.crm = null;
    profile.crmState = null;
    await expect(decide()).rejects.toBeInstanceOf(BadRequestException);
  });
  it('não aprova médico sem especialidade', async () => {
    profile.specialtyId = null;
    await expect(decide()).rejects.toBeInstanceOf(BadRequestException);
  });
  it('permite solicitar correção para perfil incompleto', async () => {
    profile.user.phone = '';
    await expect(decide(input('CHANGES_REQUESTED'))).resolves.toMatchObject({ data: { status: 'CHANGES_REQUESTED' } });
  });
  it('nega conta de profissional inativa', async () => {
    profile.user.status = UserStatus.DELETION_PENDING;
    await expect(decide()).rejects.toBeInstanceOf(ConflictException);
  });
  it('defende motivo vazio mesmo em chamada direta do serviço', async () => {
    const dto = input();
    dto.reason = ' ';
    await expect(decide(dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('conflito de compare-and-swap não cria auditoria ou evento', async () => {
    tx.professional.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(decide()).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
  });
  it('propaga falha de auditoria para abortar a transação sem emitir evento', async () => {
    tx.auditLog.create.mockRejectedValueOnce(new Error('audit failed'));
    await expect(decide()).rejects.toThrow('audit failed');
    expect(outbox.emitOutbox).not.toHaveBeenCalled();
  });
  it('propaga falha da Outbox para abortar a transação', async () => {
    outbox.emitOutbox.mockRejectedValueOnce(new Error('outbox failed'));
    await expect(decide()).rejects.toThrow('outbox failed');
  });
  it('converte P2034 em 409 sem repetir uma decisão automaticamente', async () => {
    db.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }));
    await expect(decide()).rejects.toBeInstanceOf(ConflictException);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
