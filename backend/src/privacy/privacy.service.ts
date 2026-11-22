import { consultaWhen } from '../common/format/when';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  Prisma,
  PrivacyRequestStatus,
  PrivacyRequestType,
  UserStatus,
} from '../generated/prisma/client';
import {
  OUTBOX_CONTRACT,
  type OutboxContract,
} from '../auth/contracts/outbox.contract';
import { PasswordHashService } from '../auth/services/password-hash.service';
import { AuthSessionsService } from '../auth/services/auth-sessions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './update-notification-preferences.dto';
import { RegisterLegalAcceptanceDto } from './register-legal-acceptance.dto';
import { CpfProtector } from '../common/security/cpf';
import { CURRENT_LEGAL_VERSIONS } from '../common/legal/legal-documents';
import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly authSessionsService: AuthSessionsService,
    @Inject(OUTBOX_CONTRACT) private readonly outbox: OutboxContract,
    private readonly cpf: CpfProtector,
  ) {}

  async getNotificationPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId,
      },
      update: {},
      create: {
        userId,
      },
    });
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId,
      },
      update: {
        ...(dto.emailEnabled !== undefined && {
          emailEnabled: dto.emailEnabled,
        }),
        ...(dto.appointmentReminders !== undefined && {
          appointmentReminders: dto.appointmentReminders,
        }),
        ...(dto.campaignUpdates !== undefined && {
          campaignUpdates: dto.campaignUpdates,
        }),
      },
      create: {
        userId,
        ...(dto.emailEnabled !== undefined && {
          emailEnabled: dto.emailEnabled,
        }),
        ...(dto.appointmentReminders !== undefined && {
          appointmentReminders: dto.appointmentReminders,
        }),
        ...(dto.campaignUpdates !== undefined && {
          campaignUpdates: dto.campaignUpdates,
        }),
      },
    });
  }

  async exportUserData(userId: string) {
    const [
      accountRow,
      patientRows,
      legalAcceptances,
      notificationPreferences,
      privacyRequests,
      appointments,
      notifications,
      professional,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          birthDate: true,
          cpfEncrypted: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      this.prisma.patient.findMany({
        where: {
          holderId: userId,
        },
        select: {
          id: true,
          relationship: true,
          name: true,
          birthDate: true,
          sex: true,
          cpfEncrypted: true,
          guardianConsentAt: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),

      this.prisma.legalAcceptance.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
          documentType: true,
          version: true,
          acceptedAt: true,
          revokedAt: true,
        },
        orderBy: {
          acceptedAt: 'asc',
        },
      }),

      this.prisma.notificationPreference.findUnique({
        where: {
          userId,
        },
        select: {
          emailEnabled: true,
          appointmentReminders: true,
          campaignUpdates: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      this.prisma.privacyRequest.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
          type: true,
          status: true,
          requestedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          requestedAt: 'asc',
        },
      }),
      this.prisma.appointment.findMany({
        where: { OR: [{ holderId: userId }, { professional: { userId } }] },
        select: {
          id: true,
          patientId: true,
          patient: { select: { name: true } },
          status: true,
          cancelledAt: true,
          cancellationReason: true,
          serviceNameSnapshot: true,
          serviceDurationMinutesSnapshot: true,
          serviceModalitySnapshot: true,
          servicePriceCentsSnapshot: true,
          professionalNameSnapshot: true,
          clinicNameSnapshot: true,
          clinicAddressSnapshot: true,
          slot: { select: { startsAt: true, endsAt: true } },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.notification.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          readAt: true,
          emailSentAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.professional.findUnique({
        where: { userId },
        select: {
          id: true,
          crm: true,
          crmState: true,
          bio: true,
          specialty: { select: { name: true } },
          verificationStatus: true,
          verificationSubmittedAt: true,
          createdAt: true,
          updatedAt: true,
          verificationDocuments: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      }),
    ]);

    // Direito de acesso (LGPD art. 18, II): o titular recebe os próprios
    // dados completos, inclusive o CPF descriptografado.
    const account = accountRow
      ? (() => {
          const { cpfEncrypted, birthDate, ...rest } = accountRow;
          return {
            ...rest,
            birthDate: birthDate.toISOString().slice(0, 10),
            cpf: this.cpf.reveal(cpfEncrypted),
          };
        })()
      : null;
    const patients = patientRows.map(({ cpfEncrypted, birthDate, ...rest }) => ({
      ...rest,
      birthDate: birthDate.toISOString().slice(0, 10),
      cpf: this.cpf.reveal(cpfEncrypted),
    }));

    return {
      exportedAt: new Date(),
      schemaVersion: 1,
      application: 'LifeHub',
      documentFiles: 'metadata_only',
      account,
      patients,
      legalAcceptances,
      notificationPreferences,
      privacyRequests,
      appointments,
      notifications,
      professional,
    };
  }

  async requestAccountDeletion(userId: string, currentPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw this.invalidCurrentPassword();
    }

    const passwordMatches = await this.passwordHashService.verify(
      user.passwordHash,
      currentPassword,
    );

    if (!passwordMatches) {
      throw this.invalidCurrentPassword();
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize submissions for this account across app instances, after reauthentication.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true, status: true },
      });
      if (!current || current.passwordHash !== user.passwordHash)
        throw this.invalidCurrentPassword();
      if (current.status === UserStatus.DELETION_PENDING) {
        const existing = await tx.privacyRequest.findFirst({
          where: {
            userId,
            type: PrivacyRequestType.ACCOUNT_DELETION,
            status: {
              in: [
                PrivacyRequestStatus.PENDING,
                PrivacyRequestStatus.PROCESSING,
              ],
            },
          },
          orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        });
        // A concurrent submission reuses the committed request; it cannot emit a second task.
        if (existing) return existing;
      }
      if (current.status !== UserStatus.ACTIVE)
        throw new ForbiddenException({
          code: 'ACCOUNT_NOT_ACTIVE',
          message: 'Esta conta não está disponível para acesso.',
        });
      const request = await tx.privacyRequest.create({
        data: {
          userId,
          type: 'ACCOUNT_DELETION',
        },
      });

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          status: 'DELETION_PENDING',
        },
      });

      await this.authSessionsService.revokeAllForUser(userId, tx);
      await this.anonymizeAccount(userId, tx);

      return tx.privacyRequest.update({
        where: { id: request.id },
        data: { status: PrivacyRequestStatus.COMPLETED, completedAt: new Date() },
      });
    });
  }

  /**
   * Eliminação dos dados pessoais (LGPD art. 18, VI), feita na mesma transação
   * do pedido. Ficam apenas registros sem identificação: o histórico de consultas
   * (para a agenda do médico) e os aceites legais (comprovação do consentimento).
   */
  private async anonymizeAccount(userId: string, tx: Prisma.TransactionClient) {
    const now = new Date();
    const tombstone = randomBytes(16).toString('hex');

    // Consultas futuras são canceladas e os horários voltam a ficar livres.
    const upcoming = await tx.appointment.findMany({
      where: {
        holderId: userId,
        status: AppointmentStatus.CONFIRMED,
        slot: { startsAt: { gt: now } },
      },
      select: {
        id: true,
        slotId: true,
        serviceNameSnapshot: true,
        clinicNameSnapshot: true,
        professional: { select: { userId: true } },
        slot: { select: { startsAt: true } },
      },
    });
    for (const appointment of upcoming) {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CANCELLED_BY_PATIENT,
          cancelledAt: now,
          cancellationReason: 'Conta excluída pelo titular.',
        },
      });
      await tx.availabilitySlot.updateMany({
        where: { id: appointment.slotId, status: 'BOOKED' },
        data: { status: 'AVAILABLE' },
      });
    }
    // O médico fica sabendo que o horário vagou. Sem o nome do paciente: ele pediu para apagar os dados.
    if (upcoming.length) {
      await tx.notification.createMany({
        data: upcoming.map((item) => ({
          userId: item.professional.userId,
          type: 'APPOINTMENT_CANCELLED',
          title: 'Consulta cancelada',
          message:
            `Um paciente encerrou a conta no LifeHub, e a consulta de ${item.serviceNameSnapshot} de ` +
            `${consultaWhen(item.slot.startsAt)} em ${item.clinicNameSnapshot} foi cancelada. O horário voltou a ficar livre.`,
          deduplicationKey: `PATIENT_ACCOUNT_DELETED:${item.id}`,
        })),
        skipDuplicates: true,
      });
    }

    // Se for médico: sai da busca, horários livres são bloqueados e as
    // consultas futuras dos pacientes são canceladas pelo profissional.
    const professional = await tx.professional.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (professional) {
      await tx.professional.update({
        where: { id: professional.id },
        // A foto sai junto com os outros dados pessoais.
        data: { verificationStatus: 'SUSPENDED', bio: null, photoUrl: null, photoStoragePath: null, photoMimeType: null, photoUpdatedAt: now },
      });
      const booked = await tx.appointment.findMany({
        where: {
          professionalId: professional.id,
          status: AppointmentStatus.CONFIRMED,
          slot: { startsAt: { gt: now } },
        },
        select: { id: true, holderId: true, serviceNameSnapshot: true, clinicNameSnapshot: true, slot: { select: { startsAt: true } } },
      });
      await tx.appointment.updateMany({
        where: { id: { in: booked.map((item) => item.id) } },
        data: {
          status: AppointmentStatus.CANCELLED_BY_PROVIDER,
          cancelledAt: now,
          cancellationReason: 'O médico encerrou a conta no LifeHub.',
        },
      });
      // Cada paciente fica sabendo que a consulta foi cancelada e pode remarcar com outro médico.
      if (booked.length) {
        await tx.notification.createMany({
          data: booked.map((item) => ({
            userId: item.holderId,
            type: 'APPOINTMENT_CANCELLED',
            title: 'Consulta cancelada',
            message:
              `Sua consulta de ${item.serviceNameSnapshot} em ${item.clinicNameSnapshot}, marcada para ` +
              consultaWhen(item.slot.startsAt) +
              ', foi cancelada porque o médico encerrou a conta no LifeHub. Você pode agendar com outro médico.',
            deduplicationKey: `PROFESSIONAL_ACCOUNT_DELETED:${item.id}`,
          })),
          skipDuplicates: true,
        });
      }
      await tx.availabilitySlot.updateMany({
        where: { professionalId: professional.id, startsAt: { gt: now } },
        data: { status: 'BLOCKED' },
      });
    }

    await tx.patient.updateMany({
      where: { holderId: userId },
      data: {
        name: 'Paciente removido',
        cpfHash: null,
        cpfEncrypted: null,
        cpfLast2: null,
        birthDate: new Date('1900-01-01T00:00:00Z'),
        sex: 'NOT_INFORMED',
        deletedAt: now,
      },
    });

    await tx.notification.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.idempotencyKey.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });

    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Conta excluída',
        email: `excluida+${tombstone}@lifehub.invalid`,
        phone: '',
        cpfHash: tombstone + tombstone,
        cpfEncrypted: '',
        cpfLast2: '00',
        birthDate: new Date('1900-01-01T00:00:00Z'),
        passwordHash: `deleted:${tombstone}`,
        status: UserStatus.DELETED,
      },
    });
  }

  private invalidCurrentPassword() {
    return new UnauthorizedException({
      code: 'INVALID_CURRENT_PASSWORD',
      message: 'Senha atual inválida.',
    });
  }

  async registerLegalAcceptance(
    userId: string,
    dto: RegisterLegalAcceptanceDto,
  ) {
    if (CURRENT_LEGAL_VERSIONS[dto.documentType] !== dto.version) {
      throw new BadRequestException({
        code: 'LEGAL_VERSION_NOT_CURRENT',
        message: 'Esta versão do documento não está vigente.',
      });
    }
    return this.prisma.legalAcceptance.upsert({
      where: {
        userId_documentType_version: {
          userId,
          documentType: dto.documentType,
          version: dto.version,
        },
      },
      update: {},
      create: {
        userId,
        documentType: dto.documentType,
        version: dto.version,
      },
    });
  }
}
