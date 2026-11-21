import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { OUTBOX_CONTRACT, type OutboxContract, type TransactionClient } from '../auth/contracts/outbox.contract';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, UserRole, UserStatus, VerificationStatus } from '../generated/prisma/client';
import { isVerificationDecision, PROFESSIONAL_VERIFICATION_DECIDED } from '../notifications/verification-decision.event';
import { DecideVerificationDto } from './dto/decide-verification.dto';

@Injectable()
export class AdminVerificationDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OUTBOX_CONTRACT) private readonly outbox: OutboxContract,
  ) {}

  async decide(actorId: string, sessionId: string, professionalId: string, dto: DecideVerificationDto) {
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    const expectedSubmittedAt = new Date(dto.expectedSubmittedAt);
    if (!isVerificationDecision(dto.decision) || !reason || reason.length > 2000 ||
        Number.isNaN(expectedSubmittedAt.getTime())) {
      throw new BadRequestException({ code: 'INVALID_VERIFICATION_DECISION', message: 'Informe decisão, motivo e data de submissão válidos.' });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await tx.user.findUnique({
          where: { id: actorId }, select: { role: true, status: true },
        });
        if (!actor || actor.role !== UserRole.ADMIN || actor.status !== UserStatus.ACTIVE) {
          throw new ForbiddenException({ code: 'ACTIVE_ADMIN_REQUIRED', message: 'Conta administrativa ativa necessária.' });
        }
        const session = await tx.authSession.findFirst({
          where: { id: sessionId, userId: actorId, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
        });
        if (!session) throw new UnauthorizedException({ code: 'ACTIVE_SESSION_REQUIRED', message: 'Sessão administrativa inválida.' });

        const professional = await tx.professional.findUnique({
          where: { id: professionalId },
          select: {
            id: true, userId: true, verificationStatus: true, verificationSubmittedAt: true,
            updatedAt: true, crm: true, crmState: true, specialtyId: true,
            user: { select: { name: true, email: true, phone: true, role: true, status: true } },
            _count: { select: { verificationDocuments: true } },
          },
        });
        if (!professional) throw new NotFoundException({ code: 'PROFESSIONAL_PROFILE_NOT_FOUND', message: 'Perfil profissional não encontrado.' });
        if (professional.verificationStatus !== VerificationStatus.PENDING ||
            !professional.verificationSubmittedAt ||
            professional.verificationSubmittedAt.getTime() !== expectedSubmittedAt.getTime()) {
          throw this.conflict();
        }
        if (professional.user.status !== UserStatus.ACTIVE || professional.user.role !== UserRole.PROFESSIONAL) {
          throw new ConflictException({ code: 'PROFESSIONAL_ACCOUNT_NOT_ELIGIBLE', message: 'A conta do profissional não está apta para análise.' });
        }
        // Mesmos dados obrigatórios da submissão: CRM, UF e especialidade.
        const complete = Boolean(professional.user.name.trim()) && Boolean(professional.user.email.trim()) &&
          Boolean(professional.user.phone.trim()) && professional._count.verificationDocuments > 0 &&
          Boolean(professional.crm?.trim()) && Boolean(professional.crmState?.trim()) &&
          Boolean(professional.specialtyId);
        if (dto.decision === VerificationStatus.APPROVED && !complete) {
          throw new BadRequestException({ code: 'INCOMPLETE_VERIFICATION_PROFILE', message: 'Perfil incompleto não pode ser aprovado.' });
        }

        const updated = await tx.professional.updateMany({
          where: {
            id: professional.id, verificationStatus: VerificationStatus.PENDING,
            verificationSubmittedAt: expectedSubmittedAt, updatedAt: professional.updatedAt,
          },
          data: { verificationStatus: dto.decision },
        });
        if (updated.count !== 1) throw this.conflict();
        const decision = await this.audit.record({
          actorId, action: PROFESSIONAL_VERIFICATION_DECIDED,
          entityType: 'PROFESSIONAL', entityId: professional.id, reason,
          details: {
            professionalId: professional.id, recipientId: professional.userId,
            fromStatus: VerificationStatus.PENDING, toStatus: dto.decision,
            submittedAt: expectedSubmittedAt.toISOString(),
            documentCount: professional._count.verificationDocuments,
          },
        }, tx);
        await this.outbox.emitOutbox({
          type: PROFESSIONAL_VERIFICATION_DECIDED,
          payload: {
            decisionId: decision.id, professionalId: professional.id,
            recipientId: professional.userId, decision: dto.decision,
            submittedAt: expectedSubmittedAt.toISOString(),
          },
        }, tx as unknown as TransactionClient);
        return { data: {
          decisionId: decision.id, professionalId: professional.id,
          status: dto.decision, reason, decidedAt: decision.createdAt.toISOString(),
          submittedAt: expectedSubmittedAt.toISOString(),
        } };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // O chamador deve atualizar a fila; não repete automaticamente uma decisão
      // sobre uma submissão que pode ter mudado durante a concorrência.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') throw this.conflict();
      throw error;
    }
  }

  private conflict() {
    return new ConflictException({
      code: 'VERIFICATION_DECISION_CONFLICT',
      message: 'A solicitação não está mais pendente nesta submissão. Atualize a fila antes de decidir.',
    });
  }
}
