import { AuditService } from '../audit/audit.service';
import { ConflictException } from '@nestjs/common';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AvailabilityStatus, Prisma } from '../generated/prisma/client';
import { ServicesService } from '../services/services.service';
import { AvailabilityService } from './availability.service';

describe('Contrato do slot para G2', () => {
  const findFirst = jest.fn();
  const prisma = {
    availabilitySlot: { findFirst },
  } as unknown as PrismaService;
  const service = new AvailabilityService(
    prisma,
    {} as ClinicsService,
    {} as ServicesService,
    { record: jest.fn() } as unknown as AuditService,
  );
  const booking = {
    clinicId: 'clinic-id',
    professionalId: 'professional-id',
    serviceId: 'service-id',
  };

  beforeEach(() => jest.clearAllMocks());

  it('só aceita slot AVAILABLE futuro do serviço, clínica e profissional informados', async () => {
    const startsAt = new Date('2030-01-10T12:00:00.000Z');
    const endsAt = new Date('2030-01-10T12:30:00.000Z');
    findFirst.mockResolvedValue({
      id: 'slot-id',
      ...booking,
      startsAt,
      endsAt,
    });

    await expect(
      service.validateSlotForBooking('slot-id', booking),
    ).resolves.toMatchObject({
      id: 'slot-id',
      ...booking,
      startsAt,
      endsAt,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'slot-id',
        clinicId: booking.clinicId,
        professionalId: booking.professionalId,
        serviceId: booking.serviceId,
        status: AvailabilityStatus.AVAILABLE,
        startsAt: { gt: expect.any(Date) },
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
  });

  it('recusa slot bloqueado, ocupado, vencido ou pertencente a outra oferta', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.validateSlotForBooking('slot-id', booking),
    ).rejects.toMatchObject({
      response: { code: 'SLOT_NOT_AVAILABLE' },
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('consulta a transação do agendamento quando fornecida', async () => {
    const txFindFirst = jest.fn().mockResolvedValue({
      id: 'slot-id',
      ...booking,
      startsAt: new Date('2030-01-10T12:00:00.000Z'),
      endsAt: new Date('2030-01-10T12:30:00.000Z'),
    });
    const tx = {
      availabilitySlot: { findFirst: txFindFirst },
    } as unknown as Prisma.TransactionClient;

    await service.validateSlotForBooking('slot-id', booking, tx);

    expect(txFindFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('retorna conflito para slot indisponível', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.validateSlotForBooking('slot-id', booking)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
