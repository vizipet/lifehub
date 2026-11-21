import { AuditService } from '../audit/audit.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  Modality,
  UserStatus,
  VerificationStatus,
} from '../generated/prisma/client';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  let service: ServicesService;

  const OWN = '550e8400-e29b-41d4-a716-446655440000';
  const prisma = {
    professional: { findUnique: jest.fn() },
    serviceProfessional: { deleteMany: jest.fn() },
    availabilitySlot: { count: jest.fn() },
    appointment: { count: jest.fn() },
    $transaction: jest.fn(),
    clinicProfessional: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const clinicsService = {
    findMineById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // O médico logado é sempre OWN nestes testes.
    prisma.professional.findUnique.mockResolvedValue({ id: OWN });
    prisma.$transaction.mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma));

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: AuditService, useValue: { record: jest.fn() } },
        ServicesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ClinicsService,
          useValue: clinicsService,
        },
      ],
    }).compile();

    service = moduleRef.get(ServicesService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('lista publicamente apenas serviços elegíveis', async () => {
    const publicServices = [
      {
        id: 'service-id',
        name: 'Consulta de clínica médica',
        description: null,
        modality: Modality.IN_PERSON,
        durationMinutes: 30,
        priceCents: null,
        professionalLinks: [],
      },
    ];

    prisma.service.findMany.mockResolvedValue(publicServices);

    const result = await service.listPublic('clinic-id');

    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: {
        clinicId: 'clinic-id',
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
        professionalLinks: {
          some: {
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
              clinicLinks: {
                some: {
                  clinicId: 'clinic-id',
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        modality: true,
        durationMinutes: true,
        priceCents: true,
        professionalLinks: {
          where: {
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
              clinicLinks: {
                some: {
                  clinicId: 'clinic-id',
                },
              },
            },
          },
          select: {
            professional: {
              select: {
                id: true,
                crm: true,
                crmState: true,
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    expect(result).toEqual(publicServices);
  });

  it('cria serviço presencial com preço opcional', async () => {
    clinicsService.findMineById.mockResolvedValue({
      id: 'clinic-id',
    });

    prisma.clinicProfessional.findMany.mockResolvedValue([
      {
        professionalId: '550e8400-e29b-41d4-a716-446655440000',
      },
    ]);

    prisma.service.create.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      name: 'Consulta de clínica médica',
      modality: Modality.IN_PERSON,
      durationMinutes: 30,
      priceCents: null,
    });

    const result = await service.createMine('clinic-id', 'user-id', {
      name: ' Consulta de clínica médica ',
      modality: Modality.IN_PERSON,
      durationMinutes: 30,
      professionalIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });

    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicId: 'clinic-id',
          name: 'Consulta de clínica médica',
          modality: Modality.IN_PERSON,
          durationMinutes: 30,
          priceCents: null,
        }),
      }),
    );

    expect(result.id).toBe('service-id');
  });

  it('cria serviço remoto com preço em centavos', async () => {
    clinicsService.findMineById.mockResolvedValue({
      id: 'clinic-id',
    });

    prisma.clinicProfessional.findMany.mockResolvedValue([
      {
        professionalId: '550e8400-e29b-41d4-a716-446655440000',
      },
    ]);

    prisma.service.create.mockResolvedValue({
      id: 'service-id',
      modality: Modality.REMOTE,
      priceCents: 15000,
    });

    await service.createMine('clinic-id', 'user-id', {
      name: 'Teleconsulta',
      modality: Modality.REMOTE,
      durationMinutes: 45,
      priceCents: 15000,
      professionalIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });

    expect(prisma.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modality: Modality.REMOTE,
          priceCents: 15000,
        }),
      }),
    );
  });

  it('recusa profissional sem vínculo com a clínica', async () => {
    clinicsService.findMineById.mockResolvedValue({
      id: 'clinic-id',
    });

    prisma.clinicProfessional.findMany.mockResolvedValue([]);

    await expect(
      service.createMine('clinic-id', 'user-id', {
        name: 'Consulta',
        modality: Modality.IN_PERSON,
        durationMinutes: 30,
        professionalIds: ['550e8400-e29b-41d4-a716-446655440000'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.service.create).not.toHaveBeenCalled();
  });


  it('retorna erro quando o serviço não existe na clínica', async () => {
    clinicsService.findMineById.mockResolvedValue({
      id: 'clinic-id',
    });

    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.findMineById('clinic-id', 'service-id', 'user-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desativa serviço sem remover seus dados', async () => {
    clinicsService.findMineById.mockResolvedValue({
      id: 'clinic-id',
    });

    prisma.service.findFirst.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      isActive: true,
    });

    prisma.service.update.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      isActive: false,
    });

    const result = await service.updateMine(
      'clinic-id',
      'service-id',
      'user-id',
      {
        isActive: false,
      },
    );

    expect(prisma.service.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'service-id',
        },
        data: {
          isActive: false,
        },
      }),
    );

    expect(result.isActive).toBe(false);
  });

  it('permite agendamento para serviço ativo e compatível', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      durationMinutes: 30,
      modality: Modality.IN_PERSON,
    });

    prisma.clinicProfessional.findFirst.mockResolvedValue({
      id: 'clinic-professional-id',
    });

    const result = await service.assertAvailableForScheduling(
      'service-id',
      'professional-id',
    );

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'service-id',
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
        professionalLinks: {
          some: {
            professionalId: 'professional-id',
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
            },
          },
        },
      },
      select: {
        id: true,
        clinicId: true,
        durationMinutes: true,
        modality: true,
      },
    });

    expect(prisma.clinicProfessional.findFirst).toHaveBeenCalledWith({
      where: {
        clinicId: 'clinic-id',
        professionalId: 'professional-id',
      },
      select: {
        id: true,
      },
    });

    expect(result.id).toBe('service-id');
  });

  it('bloqueia agendamento para serviço inativo ou incompatível', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.assertAvailableForScheduling(
        'service-id',
        'professional-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.clinicProfessional.findFirst).not.toHaveBeenCalled();
  });

  it('bloqueia agendamento quando clínica ou profissional não está aprovado', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.assertAvailableForScheduling(
        'service-id',
        'professional-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.clinicProfessional.findFirst).not.toHaveBeenCalled();
  });

  it('bloqueia agendamento se profissional não estiver mais vinculado à clínica', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      durationMinutes: 30,
      modality: Modality.IN_PERSON,
    });

    prisma.clinicProfessional.findFirst.mockResolvedValue(null);

    await expect(
      service.assertAvailableForScheduling(
        'service-id',
        'professional-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
