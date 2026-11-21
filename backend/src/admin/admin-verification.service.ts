import { BadGatewayException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { validateVerificationFile } from '../verification/verification-file.validator';
import { AdminDocumentReader } from './admin-document-reader.service';
import { AdminVerificationQueriesService } from './admin-verification-queries.service';
import { DocumentAccessTicketService, DOCUMENT_ACCESS_TTL_SECONDS } from './document-access-ticket.service';

@Injectable()
export class AdminVerificationService extends AdminVerificationQueriesService {
  constructor(
    prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tickets: DocumentAccessTicketService,
    private readonly reader: AdminDocumentReader,
    private readonly sessions: AuthSessionsService,
  ) { super(prisma); }

  private async authorize(actorId: string, sessionId: string) {
    await this.assertActiveAdmin(actorId);
    await this.sessions.assertSessionActive(sessionId, actorId);
  }

  private async document(documentId: string) {
    const document = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
      select: { id: true, professionalId: true, storagePath: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    if (!document) throw new NotFoundException({
      code: 'VERIFICATION_DOCUMENT_NOT_FOUND', message: 'Documento de verificação não encontrado.',
    });
    return document;
  }

  async grantDocumentAccess(actorId: string, documentId: string, sessionId: string) {
    await this.authorize(actorId, sessionId);
    const document = await this.document(documentId);
    const grant = await this.audit.record({
      actorId, action: 'VERIFICATION_DOCUMENT_ACCESS_GRANTED',
      entityType: 'VERIFICATION_DOCUMENT', entityId: document.id,
      details: { professionalId: document.professionalId, expiresInSeconds: DOCUMENT_ACCESS_TTL_SECONDS },
    });
    const ticket = this.tickets.issue(actorId, sessionId, document.id, grant.id);
    return { data: {
      documentId: document.id,
      url: `/api/v1/admin/verifications/documents/${document.id}/content?ticket=${encodeURIComponent(ticket)}`,
      expiresInSeconds: DOCUMENT_ACCESS_TTL_SECONDS,
    } };
  }

  async openDocument(actorId: string, documentId: string, sessionId: string, ticket: string) {
    await this.authorize(actorId, sessionId);
    const grantId = this.tickets.verify(ticket, actorId, sessionId, documentId);
    const grant = await this.prisma.auditLog.findUnique({
      where: { id: grantId },
      select: { actorId: true, action: true, entityType: true, entityId: true },
    });
    if (!grant || grant.actorId !== actorId || grant.action !== 'VERIFICATION_DOCUMENT_ACCESS_GRANTED' ||
        grant.entityType !== 'VERIFICATION_DOCUMENT' || grant.entityId !== documentId) {
      throw new ForbiddenException({ code: 'DOCUMENT_ACCESS_GRANT_REQUIRED', message: 'Concessão de acesso não encontrada.' });
    }
    const document = await this.document(documentId);
    const buffer = await this.reader.read(document.storagePath);
    let file: ReturnType<typeof validateVerificationFile>;
    try {
      file = validateVerificationFile({
        originalname: document.originalName, mimetype: document.mimeType,
        size: buffer.length, buffer,
      });
      if (file.sizeBytes !== document.sizeBytes) throw new Error('size mismatch');
    } catch {
      throw new BadGatewayException({ code: 'VERIFICATION_DOCUMENT_CONTENT_INVALID', message: 'O conteúdo do documento é inválido.' });
    }
    // Reconfere expiração, papel, conta e sessão depois da espera externa.
    this.tickets.verify(ticket, actorId, sessionId, documentId);
    await this.authorize(actorId, sessionId);
    // Registra a requisição autenticada com conteúdo obtido/validado antes de
    // liberá-lo. Não afirma leitura humana nem recebimento integral pelo cliente.
    await this.audit.record({
      actorId, action: 'VERIFICATION_DOCUMENT_CONTENT_ACCESSED',
      entityType: 'VERIFICATION_DOCUMENT', entityId: document.id,
      details: {
        professionalId: document.professionalId, grantId,
        bytes: buffer.length, mimeType: file.mimeType,
      },
    });
    this.tickets.verify(ticket, actorId, sessionId, documentId);
    return {
      buffer, mimeType: file.mimeType,
      filename: `verification-document-${document.id}${file.extension}`,
    };
  }
}
