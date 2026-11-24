import { AuditService } from '../audit/audit.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AvailabilityStatus } from '../generated/prisma/client';
import { ServicesService } from '../services/services.service';
import { AvailabilityService } from './availability.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;

  const prisma = {
    availabilitySlot: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    professional: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const clinicsService = {
    findMineById: jest.fn(),
  };

  const servicesService = {
    assertProfessionalCanOfferService: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        AvailabilityService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ClinicsService,
          useValue: clinicsService,
        },
        {
          provide: ServicesService,
          useValue: servicesService,
        },
      ],
    }).compile();

    service = moduleRef.get(AvailabilityService);

    clinicsService.findMineById.mockResolvedValue({
      id: 'clinic-id',
    });
    // O médico logado é sempre "professional-id" nestes testes.
    prisma.professional.findUnique.mockResolvedValue({ id: 'professional-id' });

    servicesService.assertProfessionalCanOfferService.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      durationMinutes: 30,
    });
  });

  it('exclui apenas horário futuro próprio sem histórico', async () => {
    prisma.availabilitySlot.deleteMany.mockResolvedValue({ count: 1 });
    await service.deleteMine('clinic-id', 'slot-id', 'user-id');
    expect(prisma.availabilitySlot.deleteMany).toHaveBeenCalledWith({ where: {
      id: 'slot-id', clinicId: 'clinic-id', professionalId: 'professional-id',
      status: { in: [AvailabilityStatus.AVAILABLE, AvailabilityStatus.BLOCKED] },
      startsAt: { gt: expect.any(Date) }, appointments: { none: {} },
    } });
  });

  it('recusa excluir horário reservado, passado, alheio ou com histórico', async () => {
    prisma.availabilitySlot.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteMine('clinic-id', 'slot-id', 'user-id')).rejects.toBeInstanceOf(ConflictException);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('cria um intervalo válido', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue(null);

    prisma.availabilitySlot.create.mockResolvedValue({
      id: 'slot-id',
      clinicId: 'clinic-id',
      professionalId: 'professional-id',
      serviceId: 'service-id',
      startsAt: new Date('2030-01-10T12:00:00.000Z'),
      endsAt: new Date('2030-01-10T12:30:00.000Z'),
      status: AvailabilityStatus.AVAILABLE,
    });

    const result = await service.createMine('clinic-id', 'user-id', {
      professionalId: 'professional-id',
      serviceId: 'service-id',
      startsAt: '2030-01-10T12:00:00.000Z',
      endsAt: '2030-01-10T12:30:00.000Z',
    });

    expect(
      servicesService.assertProfessionalCanOfferService,
    ).toHaveBeenCalledWith('service-id', 'professional-id', 'clinic-id');

    expect(prisma.availabilitySlot.create).toHaveBeenCalledWith({
      data: {
        clinicId: 'clinic-id',
        professionalId: 'professional-id',
        serviceId: 'service-id',
        startsAt: new Date('2030-01-10T12:00:00.000Z'),
        endsAt: new Date('2030-01-10T12:30:00.000Z'),
      },
    });

    expect(result.id).toBe('slot-id');
  });

  it('recusa sobreposição parcial', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue({
      id: 'existing-slot',
    });

    await expect(
      service.createMine('clinic-id', 'user-id', {
        professionalId: 'professional-id',
        serviceId: 'service-id',
        startsAt: '2030-01-10T12:15:00.000Z',
        endsAt: '2030-01-10T12:45:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.availabilitySlot.create).not.toHaveBeenCalled();
  });

  it('recusa sobreposição total', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue({
      id: 'existing-slot',
    });

    await expect(
      service.createMine('clinic-id', 'user-id', {
        professionalId: 'professional-id',
        serviceId: 'service-id',
        startsAt: '2030-01-10T11:00:00.000Z',
        endsAt: '2030-01-10T14:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.availabilitySlot.findFirst).toHaveBeenCalledWith({
      where: {
        professionalId: 'professional-id',
        startsAt: {
          lt: new Date('2030-01-10T14:00:00.000Z'),
        },
        endsAt: {
          gt: new Date('2030-01-10T11:00:00.000Z'),
        },
      },
      select: {
        id: true,
      },
    });

    expect(prisma.availabilitySlot.create).not.toHaveBeenCalled();
  });

  it('recusa horário no passado', async () => {
    await expect(
      service.createMine('clinic-id', 'user-id', {
        professionalId: 'professional-id',
        serviceId: 'service-id',
        startsAt: '2020-01-10T12:00:00.000Z',
        endsAt: '2020-01-10T12:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      servicesService.assertProfessionalCanOfferService,
    ).not.toHaveBeenCalled();

    expect(prisma.availabilitySlot.create).not.toHaveBeenCalled();
  });

  it('recusa serviço inativo ou indisponível', async () => {
    servicesService.assertProfessionalCanOfferService.mockRejectedValue(
      new ConflictException({
        code: 'SERVICE_NOT_AVAILABLE',
      }),
    );

    await expect(
      service.createMine('clinic-id', 'user-id', {
        professionalId: 'professional-id',
        serviceId: 'inactive-service-id',
        startsAt: '2030-01-10T12:00:00.000Z',
        endsAt: '2030-01-10T12:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.availabilitySlot.findFirst).not.toHaveBeenCalled();
    expect(prisma.availabilitySlot.create).not.toHaveBeenCalled();
  });

  it('normaliza America/Recife para UTC', async () => {
    prisma.availabilitySlot.findFirst.mockResolvedValue(null);

    prisma.availabilitySlot.create.mockResolvedValue({
      id: 'slot-id',
    });

    await service.createMine('clinic-id', 'user-id', {
      professionalId: 'professional-id',
      serviceId: 'service-id',
      startsAt: '2030-01-10T09:00:00-03:00',
      endsAt: '2030-01-10T09:30:00-03:00',
    });

    expect(prisma.availabilitySlot.create).toHaveBeenCalledWith({
      data: {
        clinicId: 'clinic-id',
        professionalId: 'professional-id',
        serviceId: 'service-id',
        startsAt: new Date('2030-01-10T12:00:00.000Z'),
        endsAt: new Date('2030-01-10T12:30:00.000Z'),
      },
    });
  });

  it('não bloqueia slot BOOKED', async () => {
    prisma.availabilitySlot.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.blockMine('clinic-id', 'slot-id', 'user-id'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'slot-id',
        clinicId: 'clinic-id',
        professionalId: 'professional-id',
        status: AvailabilityStatus.AVAILABLE,
      },
      data: {
        status: AvailabilityStatus.BLOCKED,
      },
    });
  });

  it('reserva atomicamente somente slot AVAILABLE futuro', async () => {
    prisma.availabilitySlot.updateMany.mockResolvedValue({
      count: 1,
    });

    prisma.availabilitySlot.findUniqueOrThrow.mockResolvedValue({
      id: 'slot-id',
      status: AvailabilityStatus.BOOKED,
    });

    const result = await service.reserveSlot('slot-id');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(prisma.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'slot-id',
        status: AvailabilityStatus.AVAILABLE,
        startsAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        status: AvailabilityStatus.BOOKED,
      },
    });

    expect(result.status).toBe(AvailabilityStatus.BOOKED);
  });

  it('libera somente slot BOOKED', async () => {
    prisma.availabilitySlot.updateMany.mockResolvedValue({
      count: 1,
    });

    prisma.availabilitySlot.findUniqueOrThrow.mockResolvedValue({
      id: 'slot-id',
      status: AvailabilityStatus.AVAILABLE,
    });

    const result = await service.releaseSlot('slot-id');

    expect(prisma.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'slot-id',
        status: AvailabilityStatus.BOOKED,
      },
      data: {
        status: AvailabilityStatus.AVAILABLE,
      },
    });

    expect(result.status).toBe(AvailabilityStatus.AVAILABLE);
  });

  it('recusa criar horário em nome de outro médico da mesma clínica', async () => {
    await expect(
      service.createMine('clinic-id', 'user-id', {
        professionalId: 'outro-medico-id',
        serviceId: 'service-id',
        startsAt: '2099-01-05T12:00:00.000Z',
        endsAt: '2099-01-05T12:30:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.availabilitySlot.create).not.toHaveBeenCalled();
  });

  it('só bloqueia horários do próprio médico', async () => {
    prisma.availabilitySlot.updateMany.mockResolvedValue({ count: 1 });
    prisma.availabilitySlot.findUniqueOrThrow.mockResolvedValue({ id: 'slot-id', status: AvailabilityStatus.BLOCKED, startsAt: new Date('2099-01-05T12:00:00Z') });

    await service.blockMine('clinic-id', 'slot-id', 'user-id');

    expect(prisma.availabilitySlot.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'slot-id',
        clinicId: 'clinic-id',
        professionalId: 'professional-id',
        status: AvailabilityStatus.AVAILABLE,
      },
      data: { status: AvailabilityStatus.BLOCKED },
    });
  });

  it('libera de volta apenas horário futuro bloqueado do próprio médico', async () => {
    prisma.availabilitySlot.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.unblockMine('clinic-id', 'slot-id', 'user-id')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.availabilitySlot.updateMany.mock.calls[0][0].where).toMatchObject({
      professionalId: 'professional-id',
      status: AvailabilityStatus.BLOCKED,
    });
  });

  it('recusa lote cuja janela ultrapassa 90 dias', async () => {
    await expect(
      service.createBatchMine('clinic-id', 'user-id', {
        slots: [
          {
            professionalId: 'professional-id',
            serviceId: 'service-id',
            startsAt: '2030-01-01T12:00:00.000Z',
            endsAt: '2030-01-01T12:30:00.000Z',
          },
          {
            professionalId: 'professional-id',
            serviceId: 'service-id',
            startsAt: '2030-04-02T12:00:00.000Z',
            endsAt: '2030-04-02T12:30:00.000Z',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('recusa intervalo com fim igual ou anterior ao início', async () => {
    await expect(
      service.createMine('clinic-id', 'user-id', {
        professionalId: 'professional-id',
        serviceId: 'service-id',
        startsAt: '2030-01-10T12:30:00.000Z',
        endsAt: '2030-01-10T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      servicesService.assertProfessionalCanOfferService,
    ).not.toHaveBeenCalled();

    expect(prisma.availabilitySlot.create).not.toHaveBeenCalled();
  });
});
