import { AuditService } from '../audit/audit.service';
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  Modality,
  UserStatus,
  VerificationStatus,
} from '../generated/prisma/client';
import { ServicesService } from './services.service';

describe('ServicesService availability contract', () => {
  let service: ServicesService;

  const prisma = {
    service: {
      findFirst: jest.fn(),
    },
  };

  const clinicsService = {};

  beforeEach(async () => {
    jest.clearAllMocks();

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

  it('permite criar disponibilidade quando serviço, clínica e profissional são elegíveis', async () => {
    prisma.service.findFirst.mockResolvedValue({
      id: 'service-id',
      clinicId: 'clinic-id',
      durationMinutes: 30,
      modality: Modality.IN_PERSON,
    });

    const result = await service.assertProfessionalCanOfferService(
      'service-id',
      'professional-id',
      'clinic-id',
    );

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'service-id',
        clinicId: 'clinic-id',
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
        clinicId: true,
        durationMinutes: true,
        modality: true,
      },
    });

    expect(result.id).toBe('service-id');
  });

  it('recusa serviço inativo ou combinação indisponível', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.assertProfessionalCanOfferService(
        'service-id',
        'professional-id',
        'clinic-id',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
