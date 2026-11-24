import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OUTBOX_CONTRACT,
  type OutboxContract,
  type TransactionClient as OutboxTransactionClient,
} from '../auth/contracts/outbox.contract';
import { AvailabilityService } from '../availability/availability.service';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  AppointmentStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client';
import { calculateAge, PatientsService } from '../patients/patients.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ServicesService } from '../services/services.service';
import { AuditService } from '../audit/audit.service';
import { openSafetyAlert } from '../safety/safety-alerts';
import type { DependentCheckDto } from './dependent-check.dto';
import { CreateAppointmentDto } from './create-appointment.dto';
import {
  AppointmentListView,
  type ListAppointmentsQueryDto,
} from './list-appointments-query.dto';
import { ATTENDANCE_GRACE_MS, ATTENDANCE_EARLY_MS, expiredWithoutAttendance, AUTO_CANCELLATION_REASON } from './appointment-expiration.service';
const CREATE_APPOINTMENT_OPERATION = 'CREATE_APPOINTMENT';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly prisma: PrismaService,
    @Inject(OUTBOX_CONTRACT)
    private readonly outbox: OutboxContract,
    private readonly servicesService: ServicesService,
    private readonly professionalsService: ProfessionalsService,
    private readonly clinicsService: ClinicsService,
    private readonly availabilityService: AvailabilityService,
    private readonly audit: AuditService,
  ) {}

  private parseIdempotencyKey(idempotencyKey: string | undefined): string {
    const key = idempotencyKey?.trim();

    if (!key || key.length > 128 || /\s/.test(key)) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key inválida.',
      });
    }

    return key;
  }

  private findAttempt(holderId: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: {
        userId_operation_key: {
          userId: holderId,
          operation: CREATE_APPOINTMENT_OPERATION,
          key,
        },
      },
      select: {
        result: true,
      },
    });
  }

  /** A mesma chave só pode repetir a mesma solicitação. */
  private replay(result: Prisma.JsonValue, dto: CreateAppointmentDto): Prisma.JsonValue {
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      result.patientId !== dto.patientId ||
      result.serviceId !== dto.serviceId ||
      result.professionalId !== dto.professionalId ||
      result.clinicId !== dto.clinicId ||
      result.slotId !== dto.slotId ||
      (result.sharePatientPhoto === true) !== (dto.sharePatientPhoto === true)
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Esta chave já foi utilizada para outro agendamento.',
      });
    }

    return result;
  }

  private isPrismaConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ((error as { code: unknown }).code === 'P2002' ||
        (error as { code: unknown }).code === 'P2034')
    );
  }
async listForUser(
  userId: string,
  role: UserRole,
  query: ListAppointmentsQueryDto,
) {
  let scope: Prisma.AppointmentWhereInput;

  if (role === UserRole.PATIENT) {
    scope = {
      holderId: userId,
    };
  } else if (role === UserRole.PROFESSIONAL) {
    const professional =
      await this.professionalsService.findMine(userId);

    scope = {
      professionalId: professional.id,
    };
  } else {
    throw new ForbiddenException({
      code: 'APPOINTMENT_LIST_FORBIDDEN',
      message:
        'Somente pacientes e profissionais podem consultar a agenda.',
    });
  }

  const view =
    query.view ?? AppointmentListView.UPCOMING;

  const now = new Date();

  // Reconcile this agenda even if the periodic job has not run yet.
  await this.prisma.appointment.updateMany({
    where: { AND: [scope, expiredWithoutAttendance(now)] },
    data: { status: 'CANCELLED_AUTOMATICALLY', cancelledAt: now, cancellationReason: AUTO_CANCELLATION_REASON },
  });
  let viewFilter: Prisma.AppointmentWhereInput;

  switch (view) {
    case AppointmentListView.CANCELLED:
      viewFilter = {
        status: {
          in: [
            AppointmentStatus.CANCELLED_BY_PATIENT,
            AppointmentStatus.CANCELLED_BY_PROVIDER,
            AppointmentStatus.CANCELLED_AUTOMATICALLY,
          ],
        },
      };
      break;

    case AppointmentListView.PAST:
      viewFilter = {
        status: {
          notIn: [
            AppointmentStatus.CANCELLED_BY_PATIENT,
            AppointmentStatus.CANCELLED_BY_PROVIDER,
            AppointmentStatus.CANCELLED_AUTOMATICALLY,
          ],
        },
        slot: {
          startsAt: {
            lte: now,
          },
        },
      };
      break;

    case AppointmentListView.OPEN:
      viewFilter = { status: AppointmentStatus.CONFIRMED };
      break;

    case AppointmentListView.UPCOMING:
    default:
      viewFilter = {
        status: AppointmentStatus.CONFIRMED,
        slot: {
          startsAt: {
            gt: now,
          },
        },
      };
      break;
  }

  const rows = await this.prisma.appointment.findMany({
    where: {
      AND: [scope, viewFilter],
    },
    orderBy:
      view === AppointmentListView.UPCOMING || view === AppointmentListView.OPEN
        ? {
            slot: {
              startsAt: 'asc',
            },
          }
        : {
            slot: {
              startsAt: 'desc',
            },
          },
    select: {
      id: true,
      holderId: true,
      patientId: true,
      serviceId: true,
      professionalId: true,
      clinicId: true,
      slotId: true,
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
      dependentCheckResult: true,
      dependentCheckedAt: true,
      attendanceRecordedAt: true,
      photoConsentAt: true,
      photoConsentRevokedAt: true,

      // Para conferir o vínculo na recepção, o médico precisa do nome do responsável.
      holder: { select: { name: true } },

      slot: {
        select: {
          startsAt: true,
          endsAt: true,
        },
      },

      // Minimização (LGPD): o médico vê nome e idade, não a data de nascimento.
      patient: {
        select: {
          name: true,
          relationship: true,
          birthDate: true,
        },
      },

      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(({ patient, holder, photoConsentAt, photoConsentRevokedAt, ...appointment }) => ({
    ...appointment,
    ...(photoConsentAt && !photoConsentRevokedAt && appointment.status === AppointmentStatus.CONFIRMED && appointment.slot.endsAt > now
      ? { photoShared: true } : {}),
    patient: {
      name: patient.name,
      relationship: patient.relationship,
      age: calculateAge(patient.birthDate),
      ...(patient.relationship !== 'SELF' && { guardianName: holder.name }),
    },
  }));
}
  /** Only the assigned, active and approved doctor can read the current photo.
   * No public URL, no access after scheduled end/cancellation/revocation. */
  async readSharedPatientPhoto(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        professional: { userId, verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } },
        holder: { status: 'ACTIVE' },
        status: AppointmentStatus.CONFIRMED,
        slot: { endsAt: { gt: new Date() } },
        photoConsentAt: { not: null },
        photoConsentRevokedAt: null,
        patient: { deletedAt: null },
      },
      select: { patient: { select: { photo: { select: { bytes: true } } } } },
    });
    if (!appointment?.patient.photo) throw new NotFoundException('Foto não disponível.');
    return { base64: Buffer.from(appointment.patient.photo.bytes).toString('base64') };
  }

  async revokeSharedPatientPhoto(holderId: string, appointmentId: string) {
    const updated = await this.prisma.appointment.updateMany({
      where: { id: appointmentId, holderId, photoConsentAt: { not: null }, photoConsentRevokedAt: null },
      data: { photoConsentRevokedAt: new Date() },
    });
    if (!updated.count) {
      const existing = await this.prisma.appointment.findFirst({
        where: { id: appointmentId, holderId }, select: { id: true },
      });
      if (!existing) throw new NotFoundException('Agendamento não encontrado.');
    }
  }

async cancelByPatient(
  holderId: string,
  appointmentId: string,
  reason?: string,
) {
  const now = new Date();

  return this.prisma.$transaction(async (tx) => {
    const appointment =
      await tx.appointment.findFirst({
        where: {
          id: appointmentId,
          holderId,
        },
        select: {
          id: true,
          holderId: true,
          professionalId: true,
          clinicId: true,
          slotId: true,
          status: true,
          slot: {
            select: {
              startsAt: true,
            },
          },
        },
      });

    if (!appointment) {
      throw new NotFoundException({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }

    if (
      appointment.status !==
      AppointmentStatus.CONFIRMED
    ) {
      throw new ConflictException({
        code: 'APPOINTMENT_NOT_CONFIRMED',
        message:
          'Somente um agendamento confirmado pode ser cancelado.',
      });
    }

    if (appointment.slot.startsAt <= now) {
      throw new ConflictException({
        code: 'APPOINTMENT_ALREADY_STARTED',
        message:
          'Não é possível cancelar uma consulta que já começou.',
      });
    }

    const updated =
      await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          holderId,
          status: AppointmentStatus.CONFIRMED,
        },
        data: {
          status:
            AppointmentStatus.CANCELLED_BY_PATIENT,
          cancelledAt: now,
          // O motivo é opcional para o paciente, mas era descartado antes.
          cancellationReason: reason?.trim() || null,
        },
      });

    if (updated.count !== 1) {
      throw new ConflictException({
        code: 'APPOINTMENT_CANCELLATION_CONFLICT',
        message:
          'O agendamento não pôde ser cancelado porque seu estado foi alterado.',
      });
    }

    await this.availabilityService.releaseSlot(
      appointment.slotId,
      tx,
    );

    await this.outbox.emitOutbox(
      {
        type: 'APPOINTMENT_CANCELLED',
        payload: {
          appointmentId: appointment.id,
          holderId: appointment.holderId,
          professionalId:
            appointment.professionalId,
          clinicId: appointment.clinicId,
          slotId: appointment.slotId,
          cancelledBy: UserRole.PATIENT,
        },
      },
      tx as unknown as OutboxTransactionClient,
    );

    return tx.appointment.findUniqueOrThrow({
      where: {
        id: appointment.id,
      },
    });
  });
}
async cancelByProfessional(
  userId: string,
  appointmentId: string,
  reason: string | undefined,
) {
  const cancellationReason = reason?.trim();

  if (!cancellationReason) {
    throw new BadRequestException({
      code: 'CANCELLATION_REASON_REQUIRED',
      message:
        'O motivo do cancelamento é obrigatório para o profissional.',
    });
  }

  const professional =
    await this.professionalsService.findMine(userId);

  const now = new Date();

  return this.prisma.$transaction(async (tx) => {
    const appointment =
      await tx.appointment.findFirst({
        where: {
          id: appointmentId,
          professionalId: professional.id,
        },
        select: {
          id: true,
          holderId: true,
          professionalId: true,
          clinicId: true,
          slotId: true,
          status: true,
          slot: {
            select: {
              startsAt: true,
            },
          },
        },
      });

    if (!appointment) {
      throw new NotFoundException({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
      });
    }

    if (
      appointment.status !==
      AppointmentStatus.CONFIRMED
    ) {
      throw new ConflictException({
        code: 'APPOINTMENT_NOT_CONFIRMED',
        message:
          'Somente um agendamento confirmado pode ser cancelado.',
      });
    }

    if (appointment.slot.startsAt <= now) {
      throw new ConflictException({
        code: 'APPOINTMENT_ALREADY_STARTED',
        message:
          'Não é possível cancelar uma consulta que já começou.',
      });
    }

    const updated =
      await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          professionalId: professional.id,
          status: AppointmentStatus.CONFIRMED,
        },
        data: {
          status:
            AppointmentStatus.CANCELLED_BY_PROVIDER,
          cancelledAt: now,
          cancellationReason,
        },
      });

    if (updated.count !== 1) {
      throw new ConflictException({
        code: 'APPOINTMENT_CANCELLATION_CONFLICT',
        message:
          'O agendamento não pôde ser cancelado porque seu estado foi alterado.',
      });
    }

    await this.availabilityService.releaseSlot(
      appointment.slotId,
      tx,
    );

    await this.outbox.emitOutbox(
      {
        type: 'APPOINTMENT_CANCELLED',
        payload: {
          appointmentId: appointment.id,
          holderId: appointment.holderId,
          professionalId:
            appointment.professionalId,
          clinicId: appointment.clinicId,
          slotId: appointment.slotId,
          cancelledBy: UserRole.PROFESSIONAL,
          reason: cancellationReason,
        },
      },
      tx as unknown as OutboxTransactionClient,
    );

    await this.audit.record(
      {
        actorId: userId,
        action: 'APPOINTMENT_CANCELLED_BY_PROFESSIONAL',
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
        reason: cancellationReason,
        details: { clinicId: appointment.clinicId, startsAt: appointment.slot.startsAt.toISOString() },
      },
      tx,
    );

    return tx.appointment.findUniqueOrThrow({
      where: {
        id: appointment.id,
      },
    });
  });
}
  async recordAttendance(userId: string, appointmentId: string) {
    const professional = await this.professionalsService.findMine(userId);
    const now = new Date();
    const updated = await this.prisma.appointment.updateMany({
      where: {
        id: appointmentId, professionalId: professional.id, status: AppointmentStatus.CONFIRMED,
        attendanceRecordedAt: null,
        slot: { startsAt: { lte: new Date(now.getTime() + ATTENDANCE_EARLY_MS) },
          endsAt: { gt: new Date(now.getTime() - ATTENDANCE_GRACE_MS) } },
      },
      data: { attendanceRecordedAt: now },
    });
    if (!updated.count) {
      const existing = await this.prisma.appointment.findFirst({
        where: { id: appointmentId, professionalId: professional.id },
        select: { status: true, attendanceRecordedAt: true },
      });
      if (!existing) throw new NotFoundException('Agendamento não encontrado.');
      if (existing.status !== AppointmentStatus.CONFIRMED || !existing.attendanceRecordedAt)
        throw new ConflictException('Presença só pode ser registrada de 15 minutos antes até 30 minutos depois do atendimento.');
    }
    return { attendanceRecorded: true };
  }

  async completeByProfessional(
    userId: string,
    appointmentId: string,
  ) {
    const professional =
      await this.professionalsService.findMine(userId);

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const appointment =
        await tx.appointment.findFirst({
          where: {
            id: appointmentId,
            professionalId: professional.id,
          },
          select: {
            id: true,
            professionalId: true,
            status: true,
            dependentCheckResult: true,
            attendanceRecordedAt: true,
            patient: { select: { relationship: true } },
            slot: {
              select: {
                endsAt: true,
              },
            },
          },
        });

      if (!appointment) {
        throw new NotFoundException({
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Agendamento não encontrado.',
        });
      }

      if (
        appointment.status !==
        AppointmentStatus.CONFIRMED
      ) {
        throw new ConflictException({
          code: 'APPOINTMENT_NOT_CONFIRMED',
          message:
            'Somente um agendamento confirmado pode ser concluído.',
        });
      }

      if (
        appointment.patient.relationship !== 'SELF' &&
        appointment.dependentCheckResult !== 'CONFIRMED'
      ) {
        throw new ConflictException({
          code: 'DEPENDENT_LINK_NOT_CHECKED',
          message:
            'Antes de concluir, confira na recepção o documento do responsável e o do dependente.',
        });
      }

      if (appointment.slot.endsAt > now) {
        throw new ConflictException({
          code: 'APPOINTMENT_NOT_FINISHED',
          message:
            'A consulta só pode ser concluída após o horário previsto.',
        });
      }

      if (!appointment.attendanceRecordedAt && appointment.dependentCheckResult !== 'CONFIRMED' &&
          appointment.slot.endsAt.getTime() + ATTENDANCE_GRACE_MS <= now.getTime()) {
        throw new ConflictException('Prazo encerrado sem presença registrada.');
      }

      const updated =
        await tx.appointment.updateMany({
          where: {
            id: appointmentId,
            professionalId: professional.id,
            status: AppointmentStatus.CONFIRMED,
          },
          data: {
            status: AppointmentStatus.COMPLETED,
          },
        });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'APPOINTMENT_COMPLETION_CONFLICT',
          message:
            'O agendamento não pôde ser concluído porque seu estado foi alterado.',
        });
      }

      await this.audit.record(
        {
          actorId: userId,
          action: 'APPOINTMENT_COMPLETED',
          entityType: 'APPOINTMENT',
          entityId: appointment.id,
          details: { endsAt: appointment.slot.endsAt.toISOString() },
        },
        tx,
      );

      return tx.appointment.findUniqueOrThrow({
        where: {
          id: appointment.id,
        },
      });
    });
  }
  async create(
    holderId: string,
    dto: CreateAppointmentDto,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const key = this.parseIdempotencyKey(idempotencyKey);
    const previous = await this.findAttempt(holderId, key);

    if (previous) {
      return this.replay(previous.result, dto);
    }

    // Domínio de José: somente o titular responsável pelo paciente pode reservar.
    await this.patientsService.assertPatientOwnership(dto.patientId, holderId);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Verificações feitas pelo domínio de Pedro com o mesmo cliente transacional.
          await this.servicesService.validateService(dto.serviceId, tx);
          const professional = await this.professionalsService.validateProfessional(
            dto.professionalId,
            tx,
          );
          const clinic = await this.clinicsService.validateClinicForBooking(
            dto.clinicId,
            tx,
          );
          const service = await this.servicesService.validateBookingEligibility(
            {
              serviceId: dto.serviceId,
              professionalId: dto.professionalId,
              clinicId: dto.clinicId,
            },
            tx,
          );
          const slot = await this.availabilityService.validateSlotForBooking(
            dto.slotId,
            {
              serviceId: dto.serviceId,
              professionalId: dto.professionalId,
              clinicId: dto.clinicId,
            },
            tx,
          );

          const slotDuration = slot.endsAt.getTime() - slot.startsAt.getTime();
          if (slotDuration < service.durationMinutes * 60_000) {
            throw new ConflictException({
              code: 'SLOT_DURATION_MISMATCH',
              message: 'O horário é menor que a duração do serviço.',
            });
          }

          // Atualização condicional AVAILABLE -> BOOKED. Outra requisição
          // que disputar o mesmo slot não poderá confirmá-lo também.
          await this.availabilityService.reserveSlot(dto.slotId, tx);

          const appointment = await tx.appointment.create({
            data: {
              holderId,
              patientId: dto.patientId,
              serviceId: dto.serviceId,
              professionalId: dto.professionalId,
              clinicId: dto.clinicId,
              slotId: dto.slotId,
              status: 'CONFIRMED',
              ...(dto.sharePatientPhoto === true && { photoConsentAt: new Date() }),
              serviceNameSnapshot: service.name,
              serviceDurationMinutesSnapshot: service.durationMinutes,
              serviceModalitySnapshot: service.modality,
              servicePriceCentsSnapshot: service.priceCents,
              professionalNameSnapshot: professional.name,
              clinicNameSnapshot: clinic.name,
              clinicAddressSnapshot: clinic.address,
            },
          });

          const result = {
            id: appointment.id,
            status: appointment.status,
            holderId: appointment.holderId,
            patientId: appointment.patientId,
            serviceId: appointment.serviceId,
            professionalId: appointment.professionalId,
            clinicId: appointment.clinicId,
            slotId: appointment.slotId,
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            serviceName: service.name,
            professionalName: professional.name,
            clinicName: clinic.name,
            createdAt: appointment.createdAt.toISOString(),
            ...(dto.sharePatientPhoto === true && { sharePatientPhoto: true }),
          };

          await this.outbox.emitOutbox(
            {
              type: 'APPOINTMENT_CONFIRMED',
              payload: {
                appointmentId: appointment.id,
                holderId,
                patientId: dto.patientId,
                slotId: dto.slotId,
                clinicId: dto.clinicId,
              },
            },
            tx as unknown as OutboxTransactionClient,
          );

          // A resposta idempotente também faz parte desta transação.
          await tx.idempotencyKey.create({
            data: {
              userId: holderId,
              operation: CREATE_APPOINTMENT_OPERATION,
              key,
              result,
            },
          });

          return result;
        },
        { maxWait: 5_000, timeout: 15_000 },
      );
    } catch (error) {
      // Entre a leitura inicial e o INSERT, outra requisição pode ter
      // confirmado esta mesma chave. A transação perdedora faz rollback.
      if (this.isPrismaConflict(error) || error instanceof ConflictException) {
        const committed = await this.findAttempt(holderId, key);
        if (committed) {
          return this.replay(committed.result, dto);
        }
      }

      if (this.isPrismaConflict(error)) {
        throw new ConflictException({
          code: 'APPOINTMENT_CONFLICT',
          message: 'O horário já foi reservado ou a operação concorreu com outra.',
        });
      }

      throw error;
    }
  }

  /**
   * Conferência presencial do vínculo responsável–dependente. Se não conferir,
   * a consulta é cancelada e a administração recebe um alerta.
   */
  async checkDependentLink(userId: string, appointmentId: string, dto: DependentCheckDto) {
    const professional = await this.professionalsService.findMine(userId);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id: appointmentId, professionalId: professional.id },
        select: {
          id: true,
          holderId: true,
          patientId: true,
          professionalId: true,
          clinicId: true,
          slotId: true,
          status: true,
          dependentCheckResult: true,
          clinicNameSnapshot: true,
          professionalNameSnapshot: true,
          patient: { select: { relationship: true } },
          slot: { select: { startsAt: true } },
        },
      });

      if (!appointment) {
        throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND', message: 'Agendamento não encontrado.' });
      }
      if (appointment.patient.relationship === 'SELF') {
        throw new BadRequestException({
          code: 'NOT_A_DEPENDENT',
          message: 'Esta consulta é do próprio titular; não há vínculo a conferir.',
        });
      }
      if (appointment.status !== AppointmentStatus.CONFIRMED) {
        throw new ConflictException({
          code: 'APPOINTMENT_NOT_CONFIRMED',
          message: 'Só dá para conferir o vínculo de uma consulta confirmada.',
        });
      }

      if (dto.result === 'CONFIRMED') {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { dependentCheckResult: 'CONFIRMED', dependentCheckedAt: now, dependentCheckedById: userId },
        });
        await this.audit.record(
          {
            actorId: userId,
            action: 'DEPENDENT_LINK_CONFIRMED',
            entityType: 'APPOINTMENT',
            entityId: appointment.id,
            details: { relationship: appointment.patient.relationship },
          },
          tx,
        );
        return tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      }

      // Não conferiu: cancela, libera o horário (se ainda não passou) e avisa a administração.
      const reason = 'Atendimento não realizado: o vínculo com o responsável não pôde ser confirmado na recepção.';
      const updated = await tx.appointment.updateMany({
        where: { id: appointment.id, status: AppointmentStatus.CONFIRMED },
        data: {
          status: AppointmentStatus.CANCELLED_BY_PROVIDER,
          cancelledAt: now,
          cancellationReason: reason,
          dependentCheckResult: 'MISMATCH',
          dependentCheckedAt: now,
          dependentCheckedById: userId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'APPOINTMENT_CANCELLATION_CONFLICT',
          message: 'A consulta mudou de estado. Atualize a página.',
        });
      }
      if (appointment.slot.startsAt > now) {
        await this.availabilityService.releaseSlot(appointment.slotId, tx);
      }

      await this.outbox.emitOutbox(
        {
          type: 'APPOINTMENT_CANCELLED',
          payload: {
            appointmentId: appointment.id,
            holderId: appointment.holderId,
            professionalId: appointment.professionalId,
            clinicId: appointment.clinicId,
            slotId: appointment.slotId,
            cancelledBy: UserRole.PROFESSIONAL,
            reason,
          },
        },
        tx as unknown as OutboxTransactionClient,
      );

      await openSafetyAlert(tx, {
        kind: 'LINK_MISMATCH',
        holderId: appointment.holderId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        details: {
          relationship: appointment.patient.relationship,
          professionalName: appointment.professionalNameSnapshot,
          clinicName: appointment.clinicNameSnapshot,
          startsAt: appointment.slot.startsAt.toISOString(),
          ...(dto.note && { note: dto.note }),
        },
      });

      await this.audit.record(
        {
          actorId: userId,
          action: 'DEPENDENT_LINK_MISMATCH',
          entityType: 'APPOINTMENT',
          entityId: appointment.id,
          reason: dto.note,
          details: { relationship: appointment.patient.relationship },
        },
        tx,
      );

      return tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    });
  }
}
