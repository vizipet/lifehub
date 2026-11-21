import { ForbiddenException, NotFoundException, UnauthorizedException, BadGatewayException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { AdminDocumentReader } from './admin-document-reader.service';
import { AdminVerificationService } from './admin-verification.service';
import { DocumentAccessTicketService } from './document-access-ticket.service';

describe('AdminVerificationService - concessão e abertura auditadas', () => {
  const actorId = '11111111-1111-4111-8111-111111111111';
  const professionalId = '22222222-2222-4222-8222-222222222222';
  const documentId = '33333333-3333-4333-8333-333333333333';
  const sessionId = '44444444-4444-4444-8444-444444444444';
  const grantId = '55555555-5555-4555-8555-555555555555';
  const buffer = Buffer.from('%PDF-1.4\n% Teste ficticio\n%%EOF');
  const storagePath = `professionals/${professionalId}/verification/private.pdf`;
  const db = {
    user: { findUnique: jest.fn() },
    verificationDocument: { findUnique: jest.fn() },
    auditLog: { create: jest.fn(), findUnique: jest.fn() },
  };
  const tickets = { issue: jest.fn(), verify: jest.fn() };
  const reader = { read: jest.fn() };
  const sessions = { assertSessionActive: jest.fn() };
  let service: AdminVerificationService;
  const open = () => service.openDocument(actorId, documentId, sessionId, 'ticket-test-only');

  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN, status: UserStatus.ACTIVE });
    db.verificationDocument.findUnique.mockResolvedValue({
      id: documentId, professionalId, storagePath, originalName: 'document.pdf',
      mimeType: 'application/pdf', sizeBytes: buffer.length,
    });
    db.auditLog.create.mockResolvedValue({ id: grantId, createdAt: new Date() });
    db.auditLog.findUnique.mockResolvedValue({
      actorId, action: 'VERIFICATION_DOCUMENT_ACCESS_GRANTED', entityType: 'VERIFICATION_DOCUMENT', entityId: documentId,
    });
    tickets.issue.mockReturnValue('ticket-test-only');
    tickets.verify.mockReturnValue(grantId);
    reader.read.mockResolvedValue(buffer);
    sessions.assertSessionActive.mockResolvedValue(undefined);
    const prisma = db as unknown as PrismaService;
    service = new AdminVerificationService(
      prisma, new AuditService(prisma), tickets as unknown as DocumentAccessTicketService,
      reader as unknown as AdminDocumentReader, sessions as unknown as AuthSessionsService,
    );
  });

  it('concede URL interna de 60s após auditoria, sem ler arquivo nem devolver URL do Storage', async () => {
    await expect(service.grantDocumentAccess(actorId, documentId, sessionId)).resolves.toEqual({ data: {
      documentId, url: `/api/v1/admin/verifications/documents/${documentId}/content?ticket=ticket-test-only`,
      expiresInSeconds: 60,
    } });
    expect(reader.read).not.toHaveBeenCalled();
    expect(tickets.issue).toHaveBeenCalledWith(actorId, sessionId, documentId, grantId);
    expect(db.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(tickets.issue.mock.invocationCallOrder[0]);
  });
  it('não emite ticket se a auditoria da concessão falhar', async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(service.grantDocumentAccess(actorId, documentId, sessionId)).rejects.toThrow('audit unavailable');
    expect(tickets.issue).not.toHaveBeenCalled();
  });
  it('retorna 404 para documento inexistente', async () => {
    db.verificationDocument.findUnique.mockResolvedValue(null);
    await expect(service.grantDocumentAccess(actorId, documentId, sessionId)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it.each([UserRole.PATIENT, UserRole.PROFESSIONAL])('bloqueia papel atual %s antes da abertura', async (role) => {
    db.user.findUnique.mockResolvedValue({ role, status: UserStatus.ACTIVE });
    await expect(open()).rejects.toBeInstanceOf(ForbiddenException);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it.each([UserStatus.BLOCKED, UserStatus.DELETION_PENDING, UserStatus.DELETED])('bloqueia conta %s', async (status) => {
    db.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN, status });
    await expect(open()).rejects.toBeInstanceOf(ForbiddenException);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('bloqueia sessão inválida antes de obter conteúdo', async () => {
    sessions.assertSessionActive.mockRejectedValueOnce(new UnauthorizedException());
    await expect(open()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('não aceita ticket sem concessão persistida', async () => {
    db.auditLog.findUnique.mockResolvedValue(null);
    await expect(open()).rejects.toBeInstanceOf(ForbiddenException);
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('obtém e valida o arquivo e audita abertura antes de liberar bytes', async () => {
    const result = await open();
    expect(result.buffer).toEqual(buffer);
    expect(result.mimeType).toBe('application/pdf');
    expect(reader.read).toHaveBeenCalledWith(storagePath);
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId, action: 'VERIFICATION_DOCUMENT_CONTENT_ACCESSED',
        entityType: 'VERIFICATION_DOCUMENT', entityId: documentId, reason: null,
        details: { professionalId, grantId, bytes: buffer.length, mimeType: 'application/pdf' },
      }, select: { id: true, createdAt: true },
    });
  });
  it('falha de leitura não grava abertura', async () => {
    reader.read.mockRejectedValueOnce(new BadGatewayException());
    await expect(open()).rejects.toBeInstanceOf(BadGatewayException);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it.each([Buffer.from('<html>invalido</html>'), Buffer.from('%PDF-1.4\nTamanho divergente')])(
    'conteúdo inválido ou divergente não é liberado nem auditado como abertura: %s', async (invalid) => {
      reader.read.mockResolvedValueOnce(invalid);
      await expect(open()).rejects.toBeInstanceOf(BadGatewayException);
      expect(db.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it('falha de auditoria impede liberar o conteúdo obtido', async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(open()).rejects.toThrow('audit unavailable');
    expect(reader.read).toHaveBeenCalledTimes(1);
  });
  it.each(['papel', 'sessao'] as const)('reconfere %s após a leitura externa', async (kind) => {
    reader.read.mockImplementationOnce(async () => {
      if (kind === 'papel') db.user.findUnique.mockResolvedValue({ role: UserRole.PATIENT, status: UserStatus.ACTIVE });
      else sessions.assertSessionActive.mockRejectedValue(new UnauthorizedException());
      return buffer;
    });
    await expect(open()).rejects.toBeInstanceOf(kind === 'papel' ? ForbiddenException : UnauthorizedException);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('reconfere expiração depois de obter o arquivo', async () => {
    tickets.verify.mockReturnValueOnce(grantId).mockImplementationOnce(() => { throw new UnauthorizedException(); });
    await expect(open()).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('duas aberturas concorrentes geram dois registros', async () => {
    await Promise.all([open(), open()]);
    expect(db.auditLog.create).toHaveBeenCalledTimes(2);
  });
  it('aguarda a persistência da auditoria de abertura antes de resolver', async () => {
    let entered!: () => void;
    let release!: (value: { id: string; createdAt: Date }) => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const persisted = new Promise<{ id: string; createdAt: Date }>((resolve) => { release = resolve; });
    db.auditLog.create.mockImplementationOnce(() => { entered(); return persisted; });
    let settled = false;
    const task = open().then((result) => { settled = true; return result; });
    await started;
    expect(settled).toBe(false);
    release({ id: grantId, createdAt: new Date() });
    await expect(task).resolves.toMatchObject({ buffer });
    expect(settled).toBe(true);
  });
});
