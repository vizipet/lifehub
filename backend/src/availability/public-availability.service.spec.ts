import { AuditService } from '../audit/audit.service';
import { AvailabilityService } from './availability.service';
import { AvailabilityStatus, UserStatus, VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClinicsService } from '../clinics/clinics.service';
import { ServicesService } from '../services/services.service';

describe('PublicAvailability', () => {
  const prisma = {
    availabilitySlot: { findMany: jest.fn() },
  };
  const service = new AvailabilityService(
    prisma as unknown as PrismaService,
    {} as ClinicsService,
    {} as ServicesService,
    { record: jest.fn() } as unknown as AuditService,
  );
  const clinicId = '11111111-1111-4111-8111-111111111111';
  const serviceId = '22222222-2222-4222-8222-222222222222';
  const professionalId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consulta apenas horários futuros e disponíveis de prestadores verificados', async () => {
    const slot = {
      id: '44444444-4444-4444-8444-444444444444',
      clinicId,
      serviceId,
      professionalId,
      startsAt: new Date('2030-01-01T12:00:00.000Z'),
      endsAt: new Date('2030-01-01T12:30:00.000Z'),
    };
    prisma.availabilitySlot.findMany.mockResolvedValueOnce([slot]);

    await expect(
      service.listPublic(clinicId, { serviceId, professionalId }),
    ).resolves.toEqual([slot]);

    const args = prisma.availabilitySlot.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      clinicId,
      serviceId,
      professionalId,
      status: AvailabilityStatus.AVAILABLE,
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
          professionalLinks: { some: { professionalId } },
        },
      },
    });
    expect(args.where.startsAt.gt).toBeInstanceOf(Date);
    expect(args.select).toEqual({
      id: true,
      clinicId: true,
      serviceId: true,
      professionalId: true,
      startsAt: true,
      endsAt: true,
    });
    expect(args.take).toBe(30);
    expect(args.orderBy).toEqual([{ startsAt: 'asc' }, { id: 'asc' }]);
  });

  it('respeita o limite validado na consulta', async () => {
    prisma.availabilitySlot.findMany.mockResolvedValueOnce([]);
    await service.listPublic(clinicId, { serviceId, professionalId, limit: 10 });
    expect(prisma.availabilitySlot.findMany.mock.calls[0][0].take).toBe(10);
  });
});
