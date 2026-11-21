import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AvailabilityStatus, Prisma } from '../generated/prisma/client';
import { ClinicsService } from '../clinics/clinics.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import type { BookingEligibilityInput, BookingSlotSnapshot } from '../services/scheduling.contract';
import { CreateAvailabilityBatchDto } from './create-availability-batch.dto';
import { CreateAvailabilitySlotDto } from './create-availability-slot.dto';
import { PublicAvailabilityQueryDto } from './public-availability-query.dto';
import { UserStatus, VerificationStatus } from '../generated/prisma/client';

const MAX_BATCH_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

type DatabaseClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicsService: ClinicsService,
    private readonly servicesService: ServicesService,
    private readonly audit: AuditService,
  ) {}

  async listPublic(clinicId: string, query: PublicAvailabilityQueryDto) {
    return this.prisma.availabilitySlot.findMany({
      where: {
        clinicId,
        serviceId: query.serviceId,
        professionalId: query.professionalId,
        status: AvailabilityStatus.AVAILABLE,
        startsAt: { gt: new Date() },
        clinic: { is: { verificationStatus: VerificationStatus.APPROVED } },
        professional: {
          is: {
            verificationStatus: VerificationStatus.APPROVED,
            user: { is: { status: UserStatus.ACTIVE } },
            clinicLinks: { some: { clinicId } },
          },
        },
        service: {
          is: {
            clinicId,
            isActive: true,
            professionalLinks: { some: { professionalId: query.professionalId } },
          },
        },
      },
      select: {
        id: true,
        clinicId: true,
        serviceId: true,
        professionalId: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: query.limit ?? 30,
    });
  }


  private parseInterval(dto: CreateAvailabilitySlotDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'AVAILABILITY_IN_PAST',
        message: 'O início do horário deve estar no futuro.',
      });
    }

    if (startsAt.getTime() >= endsAt.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_AVAILABILITY_INTERVAL',
        message: 'O fim do horário deve ser posterior ao início.',
      });
    }

    return {
      startsAt,
      endsAt,
    };
  }

  private async assertNoOverlap(
    db: DatabaseClient,
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const overlap = await db.availabilitySlot.findFirst({
      where: {
        professionalId,
        startsAt: {
          lt: endsAt,
        },
        endsAt: {
          gt: startsAt,
        },
      },
      select: {
        id: true,
      },
    });

    if (overlap) {
      throw new ConflictException({
        code: 'AVAILABILITY_OVERLAP',
        message:
          'O profissional já possui um horário que se sobrepõe a este intervalo.',
      });
    }
  }

  private isOverlapConstraintError(error: unknown) {
    return (
      error instanceof Error &&
      error.message.includes('availability_slots_professional_no_overlap')
    );
  }

  private async createSlot(
    db: DatabaseClient,
    clinicId: string,
    dto: CreateAvailabilitySlotDto,
    startsAt: Date,
    endsAt: Date,
  ) {
    await this.assertNoOverlap(db, dto.professionalId, startsAt, endsAt);

    try {
      return await db.availabilitySlot.create({
        data: {
          clinicId,
          professionalId: dto.professionalId,
          serviceId: dto.serviceId,
          startsAt,
          endsAt,
        },
      });
    } catch (error) {
      if (this.isOverlapConstraintError(error)) {
        throw new ConflictException({
          code: 'AVAILABILITY_OVERLAP',
          message:
            'O profissional já possui um horário que se sobrepõe a este intervalo.',
        });
      }

      throw error;
    }
  }

  async createMine(
    clinicId: string,
    userId: string,
    dto: CreateAvailabilitySlotDto,
  ) {
    await this.clinicsService.findMineById(clinicId, userId);
    await this.assertOwnProfessional(userId, [dto.professionalId]);

    const { startsAt, endsAt } = this.parseInterval(dto);

    await this.servicesService.assertProfessionalCanOfferService(
      dto.serviceId,
      dto.professionalId,
      clinicId,
    );

    return this.prisma.$transaction(async (tx) => {
      const slot = await this.createSlot(tx, clinicId, dto, startsAt, endsAt);
      await this.audit.record(
        {
          actorId: userId,
          action: 'SLOT_CREATED',
          entityType: 'AVAILABILITY_SLOT',
          entityId: slot.id,
          details: { clinicId, serviceId: dto.serviceId, startsAt: startsAt.toISOString() },
        },
        tx,
      );
      return slot;
    });
  }

  async createBatchMine(
    clinicId: string,
    userId: string,
    dto: CreateAvailabilityBatchDto,
  ) {
    await this.clinicsService.findMineById(clinicId, userId);
    await this.assertOwnProfessional(
      userId,
      dto.slots.map((slot) => slot.professionalId),
    );

    const parsedSlots = dto.slots.map((slot) => ({
      dto: slot,
      ...this.parseInterval(slot),
    }));

    const earliestStart = Math.min(
      ...parsedSlots.map(({ startsAt }) => startsAt.getTime()),
    );
    const latestEnd = Math.max(
      ...parsedSlots.map(({ endsAt }) => endsAt.getTime()),
    );

    if (latestEnd - earliestStart > MAX_BATCH_WINDOW_MS) {
      throw new BadRequestException({
        code: 'AVAILABILITY_BATCH_TOO_LONG',
        message:
          'A janela entre o primeiro início e o último fim do lote não pode ultrapassar 90 dias.',
      });
    }

    for (const slot of parsedSlots) {
      await this.servicesService.assertProfessionalCanOfferService(
        slot.dto.serviceId,
        slot.dto.professionalId,
        clinicId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const created = [];

      for (const slot of parsedSlots) {
        created.push(
          await this.createSlot(
            tx,
            clinicId,
            slot.dto,
            slot.startsAt,
            slot.endsAt,
          ),
        );
      }

      await this.audit.record(
        {
          actorId: userId,
          action: 'SLOTS_OPENED',
          entityType: 'CLINIC',
          entityId: clinicId,
          details: {
            count: created.length,
            from: new Date(earliestStart).toISOString(),
            to: new Date(latestEnd).toISOString(),
            serviceIds: [...new Set(created.map((slot) => slot.serviceId))],
          },
        },
        tx,
      );
      return created;
    });
  }

  private async professionalIdOf(userId: string): Promise<string> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!professional) {
      throw new ConflictException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Perfil profissional não encontrado.',
      });
    }
    return professional.id;
  }

  /** Impede que um médico crie horários em nome de outro da mesma clínica. */
  private async assertOwnProfessional(userId: string, professionalIds: string[]) {
    const own = await this.professionalIdOf(userId);
    if (professionalIds.some((id) => id !== own)) {
      throw new ForbiddenException({
        code: 'AVAILABILITY_NOT_OWN_PROFESSIONAL',
        message: 'Você só pode criar horários na sua própria agenda.',
      });
    }
  }

  /** Agenda do próprio médico nesta clínica (livres, reservados e bloqueados). */
  async listMine(clinicId: string, userId: string, from?: string, to?: string) {
    await this.clinicsService.findMineById(clinicId, userId);
    const professionalId = await this.professionalIdOf(userId);
    const start = from ? new Date(from) : new Date(Date.now() - 3600_000);
    const end = to ? new Date(to) : new Date(start.getTime() + 14 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException({
        code: 'INVALID_AVAILABILITY_RANGE',
        message: 'Período inválido.',
      });
    }
    if (end.getTime() - start.getTime() > MAX_BATCH_WINDOW_MS) {
      throw new BadRequestException({
        code: 'AVAILABILITY_RANGE_TOO_LONG',
        message: 'Consulte no máximo 90 dias por vez.',
      });
    }
    return this.prisma.availabilitySlot.findMany({
      where: { clinicId, professionalId, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        service: { select: { id: true, name: true, modality: true } },
      },
    });
  }

  /** Volta um horário bloqueado (do próprio médico) para disponível. */
  async unblockMine(clinicId: string, slotId: string, userId: string) {
    await this.clinicsService.findMineById(clinicId, userId);
    const professionalId = await this.professionalIdOf(userId);
    const result = await this.prisma.availabilitySlot.updateMany({
      where: {
        id: slotId,
        clinicId,
        professionalId,
        status: AvailabilityStatus.BLOCKED,
        startsAt: { gt: new Date() },
      },
      data: { status: AvailabilityStatus.AVAILABLE },
    });
    if (result.count !== 1) {
      throw new ConflictException({
        code: 'SLOT_NOT_BLOCKED',
        message: 'Somente um horário futuro bloqueado pode ser liberado.',
      });
    }
    const slot = await this.prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slotId } });
    await this.audit.record({
      actorId: userId,
      action: 'SLOT_UNBLOCKED',
      entityType: 'AVAILABILITY_SLOT',
      entityId: slotId,
      details: { clinicId, startsAt: slot.startsAt.toISOString() },
    });
    return slot;
  }

  async blockMine(clinicId: string, slotId: string, userId: string) {
    await this.clinicsService.findMineById(clinicId, userId);
    // Cada médico só bloqueia os próprios horários, mesmo dividindo a clínica.
    const professionalId = await this.professionalIdOf(userId);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.availabilitySlot.updateMany({
        where: {
          id: slotId,
          clinicId,
          professionalId,
          status: AvailabilityStatus.AVAILABLE,
        },
        data: {
          status: AvailabilityStatus.BLOCKED,
        },
      });

      if (result.count !== 1) {
        throw new ConflictException({
          code: 'SLOT_NOT_AVAILABLE_FOR_BLOCK',
          message: 'Somente um horário AVAILABLE pode ser bloqueado.',
        });
      }

      const blocked = await tx.availabilitySlot.findUniqueOrThrow({ where: { id: slotId } });
      await this.audit.record(
        {
          actorId: userId,
          action: 'SLOT_BLOCKED',
          entityType: 'AVAILABILITY_SLOT',
          entityId: slotId,
          details: { clinicId, startsAt: blocked.startsAt.toISOString() },
        },
        tx,
      );
      return tx.availabilitySlot.findUniqueOrThrow({
        where: {
          id: slotId,
        },
      });
    });
  }

  /**
   * Contrato de leitura para G2: o slot deve pertencer exatamente ao contexto
   * informado e ainda estar disponível no instante da consulta.
   * Também deve ser chamado com a transação do appointment; reserveSlot
   * continua sendo a operação atômica que decide quem vence a disputa.
   */
  async validateSlotForBooking(
    slotId: string,
    input: Pick<BookingEligibilityInput, 'clinicId' | 'professionalId' | 'serviceId'>,
    tx?: Prisma.TransactionClient,
  ): Promise<BookingSlotSnapshot> {
    const db = tx ?? this.prisma;
    const slot = await db.availabilitySlot.findFirst({
      where: {
        id: slotId,
        clinicId: input.clinicId,
        professionalId: input.professionalId,
        serviceId: input.serviceId,
        status: AvailabilityStatus.AVAILABLE,
        startsAt: { gt: new Date() },
      },
      select: {
        id: true,
        clinicId: true,
        professionalId: true,
        serviceId: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!slot) {
      throw new ConflictException({
        code: 'SLOT_NOT_AVAILABLE',
        message: 'Horário indisponível ou incompatível com os dados da consulta.',
      });
    }

    return slot;
  }

  private async reserveWithClient(db: DatabaseClient, slotId: string) {
    const result = await db.availabilitySlot.updateMany({
      where: {
        id: slotId,
        status: AvailabilityStatus.AVAILABLE,
        startsAt: {
          gt: new Date(),
        },
      },
      data: {
        status: AvailabilityStatus.BOOKED,
      },
    });

    if (result.count !== 1) {
      throw new ConflictException({
        code: 'SLOT_NOT_AVAILABLE',
        message: 'O horário não está disponível para reserva.',
      });
    }

    return db.availabilitySlot.findUniqueOrThrow({
      where: {
        id: slotId,
      },
    });
  }

  async reserveSlot(slotId: string, tx?: Prisma.TransactionClient) {
    if (tx) {
      return this.reserveWithClient(tx, slotId);
    }

    return this.prisma.$transaction((transaction) =>
      this.reserveWithClient(transaction, slotId),
    );
  }

  private async releaseWithClient(db: DatabaseClient, slotId: string) {
    const result = await db.availabilitySlot.updateMany({
      where: {
        id: slotId,
        status: AvailabilityStatus.BOOKED,
      },
      data: {
        status: AvailabilityStatus.AVAILABLE,
      },
    });

    if (result.count !== 1) {
      throw new ConflictException({
        code: 'SLOT_NOT_BOOKED',
        message: 'Somente um horário BOOKED pode ser liberado.',
      });
    }

    return db.availabilitySlot.findUniqueOrThrow({
      where: {
        id: slotId,
      },
    });
  }

  async releaseSlot(slotId: string, tx?: Prisma.TransactionClient) {
    if (tx) {
      return this.releaseWithClient(tx, slotId);
    }

    return this.prisma.$transaction((transaction) =>
      this.releaseWithClient(transaction, slotId),
    );
  }
}
