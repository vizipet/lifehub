import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { calculateAge } from '../patients/patients.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';
import { Inject } from '@nestjs/common';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service';
import { CpfProtector, maskCpf, normalizeCpf } from '../common/security/cpf';
import { ACTION_LABELS, describeAudit, PROFESSIONAL_ACTIONS } from './audit-describe';
import {
  ClinicDecisionDto,
  ListAuditQueryDto,
  ListClinicsQueryDto,
  ListUsersQueryDto,
  UpdateUserStatusDto,
  ListSafetyAlertsQueryDto,
  ResolveSafetyAlertDto,
} from './admin-management.dto';


@Injectable()
export class AdminManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: AuthSessionsService,
    private readonly cpf: CpfProtector,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** Abre um documento de local para o admin. Cada abertura fica na auditoria. */
  async openClinicDocument(actorId: string, documentId: string) {
    const document = await this.prisma.clinicDocument.findUnique({
      where: { id: documentId },
      select: { id: true, clinicId: true, originalName: true, mimeType: true, storagePath: true },
    });
    if (!document) {
      throw new NotFoundException({ code: 'CLINIC_DOCUMENT_NOT_FOUND', message: 'Documento não encontrado.' });
    }
    const buffer = await this.storage.read(document.storagePath);
    await this.audit.record({
      actorId,
      action: 'CLINIC_DOCUMENT_OPENED',
      entityType: 'CLINIC',
      entityId: document.clinicId,
      details: { documentId: document.id, originalName: document.originalName },
    });
    return { buffer, mimeType: document.mimeType, originalName: document.originalName };
  }

  async overview() {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 86_400_000);
    const [
      patients,
      professionals,
      pendingProfessionals,
      pendingClinics,
      upcomingAppointments,
      appointmentsLast30,
      publishedCampaigns,
      blockedUsers,
      openSafetyAlerts,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'PATIENT', status: 'ACTIVE' } }),
      this.prisma.professional.count({ where: { verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } } }),
      this.prisma.professional.count({ where: { verificationStatus: 'PENDING', verificationSubmittedAt: { not: null } } }),
      this.prisma.clinic.count({ where: { verificationStatus: 'PENDING' } }),
      this.prisma.appointment.count({ where: { status: 'CONFIRMED', slot: { startsAt: { gt: now } } } }),
      this.prisma.appointment.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.campaign.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.user.count({ where: { status: 'BLOCKED' } }),
      this.prisma.safetyAlert.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      openSafetyAlerts,
      patients,
      professionals,
      pendingProfessionals,
      pendingClinics,
      upcomingAppointments,
      appointmentsLast30,
      publishedCampaigns,
      blockedUsers,
    };
  }

  /** Alertas de dependentes para a administração analisar. Nunca mostra CPF. */
  async listSafetyAlerts(query: ListSafetyAlertsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SafetyAlertWhereInput = { status: query.status ?? 'OPEN' };
    const [rows, total] = await Promise.all([
      this.prisma.safetyAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          kind: true,
          status: true,
          details: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          appointmentId: true,
          holder: { select: { id: true, name: true, email: true, status: true } },
          patient: { select: { name: true, relationship: true, birthDate: true } },
        },
      }),
      this.prisma.safetyAlert.count({ where }),
    ]);

    // Nomes das outras contas que têm o mesmo CPF de dependente.
    const otherIds = [
      ...new Set(
        rows.flatMap((row) => {
          const ids = (row.details as { otherHolderIds?: unknown }).otherHolderIds;
          return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
        }),
      ),
    ];
    const others = otherIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(others.map((user) => [user.id, user.name]));

    return {
      data: rows.map(({ patient, details, ...row }) => {
        const ids = (details as { otherHolderIds?: unknown }).otherHolderIds;
        return {
          ...row,
          details,
          patient: patient
            ? { name: patient.name, relationship: patient.relationship, age: calculateAge(patient.birthDate) }
            : null,
          otherHolders: Array.isArray(ids)
            ? ids.filter((id): id is string => typeof id === 'string').map((id) => ({ id, name: nameOf.get(id) ?? 'Conta removida' }))
            : [],
        };
      }),
      meta: { page, limit, total },
    };
  }

  async resolveSafetyAlert(actorId: string, alertId: string, dto: ResolveSafetyAlertDto) {
    const updated = await this.prisma.safetyAlert.updateMany({
      where: { id: alertId, status: 'OPEN' },
      data: { status: 'RESOLVED', resolution: dto.resolution, resolvedById: actorId, resolvedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new NotFoundException({ code: 'SAFETY_ALERT_NOT_FOUND', message: 'Alerta não encontrado ou já resolvido.' });
    }
    const alert = await this.prisma.safetyAlert.findUniqueOrThrow({
      where: { id: alertId },
      select: { id: true, kind: true, holderId: true, status: true },
    });
    await this.audit.record({
      actorId,
      action: 'SAFETY_ALERT_RESOLVED',
      entityType: 'USER',
      entityId: alert.holderId,
      reason: dto.resolution,
      details: { alertId: alert.id, kind: alert.kind },
    });
    return alert;
  }

  async listUsers(query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      status: query.status ?? { in: [UserStatus.ACTIVE, UserStatus.BLOCKED] },
      ...(query.role && { role: query.role }),
    };
    if (query.q) {
      const digits = normalizeCpf(query.q);
      where.OR =
        digits.length === 11
          ? [{ cpfHash: this.cpf.hash(digits) }]
          : [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q.toLowerCase() } },
            ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          cpfLast2: true,
          createdAt: true,
          professionalProfile: { select: { verificationStatus: true, crm: true, crmState: true } },
        },
      }),
    ]);
    return {
      data: rows.map(({ cpfLast2, ...user }) => ({ ...user, cpfMasked: maskCpf(cpfLast2) })),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async updateUserStatus(actorId: string, userId: string, dto: UpdateUserStatusDto) {
    if (actorId === userId) {
      throw new ForbiddenException({
        code: 'CANNOT_CHANGE_OWN_STATUS',
        message: 'Você não pode bloquear a própria conta.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
      if (!user) {
        throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Usuário não encontrado.' });
      }
      if (user.role === 'ADMIN') {
        throw new ForbiddenException({ code: 'CANNOT_BLOCK_ADMIN', message: 'Administradores não podem ser bloqueados por esta tela.' });
      }
      if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.BLOCKED) {
        throw new BadRequestException({ code: 'USER_STATUS_LOCKED', message: 'Esta conta foi excluída e não pode ser alterada.' });
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status },
        select: { id: true, name: true, status: true },
      });
      if (dto.status === UserStatus.BLOCKED) {
        // Bloqueio vale na hora: todas as sessões abertas são encerradas.
        await this.sessions.revokeAllForUser(userId, tx);
      }
      await this.audit.record(
        {
          actorId,
          action: dto.status === UserStatus.BLOCKED ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
          entityType: 'USER',
          entityId: userId,
          reason: dto.reason,
          details: { from: user.status, to: dto.status },
        },
        tx,
      );
      return updated;
    });
  }

  async listClinics(query: ListClinicsQueryDto) {
    const where: Prisma.ClinicWhereInput = { verificationStatus: query.status ?? 'PENDING' };
    const [total, rows] = await Promise.all([
      this.prisma.clinic.count({ where }),
      this.prisma.clinic.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          cnes: true,
          cep: true,
          documents: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
          },
          name: true,
          address: true,
          neighborhood: true,
          city: true,
          verificationStatus: true,
          createdAt: true,
          professionalLinks: {
            select: {
              professional: {
                select: { id: true, crm: true, crmState: true, verificationStatus: true, user: { select: { name: true } } },
              },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map(({ professionalLinks, ...clinic }) => ({
        ...clinic,
        professionals: professionalLinks.map(({ professional }) => ({
          id: professional.id,
          name: professional.user.name,
          crm: professional.crm,
          crmState: professional.crmState,
          verificationStatus: professional.verificationStatus,
        })),
      })),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  async decideClinic(actorId: string, clinicId: string, dto: ClinicDecisionDto) {
    // Aprovar exige a conferência completa: CNES, endereço e médico no CNES.
    if (
      dto.decision === 'APPROVED' &&
      !(
        dto.checklist?.cnesChecked &&
        dto.checklist.addressMatches &&
        dto.checklist.professionalListed &&
        dto.checklist.documentChecked
      )
    ) {
      throw new BadRequestException({
        code: 'CLINIC_CHECKLIST_INCOMPLETE',
        message: 'Para aprovar, confira o CNES no DATASUS, o endereço, o médico e o documento do local, e marque os quatro itens.',
      });
    }
    if (dto.decision !== 'APPROVED' && !dto.reason) {
      throw new BadRequestException({
        code: 'DECISION_REASON_REQUIRED',
        message: 'Explique o motivo para o médico responsável.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, verificationStatus: true, cnes: true, _count: { select: { documents: true } } },
      });
      if (!clinic) {
        throw new NotFoundException({ code: 'CLINIC_NOT_FOUND', message: 'Clínica não encontrada.' });
      }
      if (dto.decision === 'APPROVED' && !clinic.cnes) {
        throw new BadRequestException({
          code: 'CLINIC_WITHOUT_CNES',
          message: 'Este local ainda não tem CNES. Peça correção ao médico antes de aprovar.',
        });
      }
      if (dto.decision === 'APPROVED' && clinic._count.documents === 0) {
        throw new BadRequestException({
          code: 'CLINIC_WITHOUT_DOCUMENT',
          message: 'Este local ainda não tem documento (alvará ou comprovante). Peça ao médico antes de aprovar.',
        });
      }
      // O recado fica guardado no local (o médico vê no cadastro) e vira notificação.
      const updated = await tx.clinic.update({
        where: { id: clinicId },
        data: { verificationStatus: dto.decision, verificationNote: dto.reason?.trim() || null },
        select: { id: true, name: true, verificationStatus: true },
      });
      const doctors = await tx.clinicProfessional.findMany({
        where: { clinicId },
        select: { professional: { select: { userId: true } } },
      });
      const title = {
        APPROVED: 'Local de atendimento aprovado',
        CHANGES_REQUESTED: 'Correção pedida no local de atendimento',
        REJECTED: 'Local de atendimento recusado',
        SUSPENDED: 'Local de atendimento suspenso',
      }[dto.decision];
      const stamp = Date.now();
      if (doctors.length) {
        await tx.notification.createMany({
          data: doctors.map(({ professional }) => ({
            userId: professional.userId,
            type: `CLINIC_${dto.decision}`,
            title,
            message:
              `${updated.name}: ` +
              (dto.decision === 'APPROVED'
                ? 'já pode receber agendamentos.'
                : 'confira o recado da administração no seu cadastro.') +
              (dto.reason?.trim() ? ` Motivo: ${dto.reason.trim()}` : ''),
            deduplicationKey: `CLINIC_${dto.decision}:${clinicId}:${professional.userId}:${stamp}`,
          })),
          skipDuplicates: true,
        });
      }
      await this.audit.record(
        {
          actorId,
          action: `CLINIC_${dto.decision}`,
          entityType: 'CLINIC',
          entityId: clinicId,
          reason: dto.reason,
          details: {
            from: clinic.verificationStatus,
            to: dto.decision,
            cnes: clinic.cnes,
            ...(dto.checklist && { checklist: { ...dto.checklist } }),
          },
        },
        tx,
      );
      return updated;
    });
  }

  /** Histórico filtrável: por pessoa (ex.: um médico), por perfil e por ação. */
  async listAudit(query: ListAuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.scope === 'PROFESSIONAL' && { action: { in: PROFESSIONAL_ACTIONS } }),
      ...(query.scope === 'ADMIN' && { action: { notIn: PROFESSIONAL_ACTIONS } }),
      ...(query.action && { action: query.action }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          reason: true,
          details: true,
          createdAt: true,
          actor: {
            select: {
              id: true,
              name: true,
              role: true,
              professionalProfile: { select: { crm: true, crmState: true } },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map(({ actor, details, ...row }) => ({
        ...row,
        actionLabel: ACTION_LABELS[row.action] ?? row.action,
        summary: describeAudit(row.action, details),
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        actorCrm: actor.professionalProfile?.crm
          ? `${actor.professionalProfile.crm}/${actor.professionalProfile.crmState}`
          : null,
      })),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    };
  }

  /** Lista de ações conhecidas, para o filtro da tela. */
  auditActions() {
    return Object.entries(ACTION_LABELS).map(([code, label]) => ({
      code,
      label,
      scope: PROFESSIONAL_ACTIONS.includes(code) ? 'PROFESSIONAL' : 'ADMIN',
    }));
  }
}
