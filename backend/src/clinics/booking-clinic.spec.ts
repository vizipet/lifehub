import { AuditService } from '../audit/audit.service';
import { NotFoundException } from '@nestjs/common';
import { Prisma, VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ClinicsService } from './clinics.service';

describe('ClinicsService — snapshot para agendamento G2', () => {
  const findFirst = jest.fn();
  const prisma = { clinic: { findFirst } } as unknown as PrismaService;
  const clinics = new ClinicsService(prisma, {} as ProfessionalsService, { record: jest.fn() } as unknown as AuditService, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('usa apenas clínica aprovada e entrega nome e endereço', async () => {
    const snapshot = {
      id: 'clinic-id',
      name: 'Clínica Vet',
      address: 'Rua Recife, 100',
    };
    findFirst.mockResolvedValue(snapshot);

    await expect(clinics.validateClinicForBooking('clinic-id')).resolves.toEqual(
      snapshot,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'clinic-id',
        verificationStatus: VerificationStatus.APPROVED,
      },
      select: {
        id: true,
        name: true,
        address: true,
      },
    });
  });

  it('recusa clínica não aprovada', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      clinics.validateClinicForBooking('clinic-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite validação na mesma transação da reserva', async () => {
    const findTx = jest.fn().mockResolvedValue({
      id: 'clinic-id', name: 'Clínica', address: 'Rua',
    });
    const tx = { clinic: { findFirst: findTx } } as unknown as Prisma.TransactionClient;

    await clinics.validateClinicForBooking('clinic-id', tx);
    expect(findTx).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
