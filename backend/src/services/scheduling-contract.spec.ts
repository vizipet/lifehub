import { AuditService } from '../audit/audit.service';
import { ConflictException } from '@nestjs/common';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  Modality,
  Prisma,
  UserStatus,
  VerificationStatus,
} from '../generated/prisma/client';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ServicesService } from './services.service';

describe('Contratos entre Pedro e Guilherme (G2)', () => {
  const serviceSnapshot = {
    id: 'service-id',
    clinicId: 'clinic-id',
    name: 'Consulta',
    durationMinutes: 30,
    modality: Modality.IN_PERSON,
    priceCents: null,
  };

  describe('validateService e validateBookingEligibility', () => {
    const findFirst = jest.fn();
    const prisma = {
      service: { findFirst },
    } as unknown as PrismaService;
    let service: ServicesService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new ServicesService(prisma, {} as ClinicsService, { record: jest.fn() } as unknown as AuditService);
    });

    it('devolve somente dados de snapshot de serviço ativo em clínica aprovada', async () => {
      findFirst.mockResolvedValue(serviceSnapshot);

      await expect(service.validateService('service-id')).resolves.toEqual(
        serviceSnapshot,
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'service-id',
          isActive: true,
          clinic: { verificationStatus: VerificationStatus.APPROVED },
        },
        select: {
          id: true,
          clinicId: true,
          name: true,
          durationMinutes: true,
          modality: true,
          priceCents: true,
        },
      });
    });

    it('recusa serviço inexistente, inativo ou sem aprovação', async () => {
      findFirst.mockResolvedValue(null);

      await expect(service.validateService('service-id')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('confere clínica, vínculo do médico e status na mesma consulta', async () => {
      findFirst.mockResolvedValue(serviceSnapshot);
      const input = {
        serviceId: 'service-id',
        clinicId: 'clinic-id',
        professionalId: 'professional-id',
      };

      await expect(service.validateBookingEligibility(input)).resolves.toEqual(
        serviceSnapshot,
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: input.serviceId,
          clinicId: input.clinicId,
          isActive: true,
          clinic: { verificationStatus: VerificationStatus.APPROVED },
          professionalLinks: {
            some: {
              professionalId: input.professionalId,
              professional: {
                verificationStatus: VerificationStatus.APPROVED,
                user: { status: UserStatus.ACTIVE },
                clinicLinks: { some: { clinicId: input.clinicId } },
              },
            },
          },
        },
        select: {
          id: true,
          clinicId: true,
          name: true,
          durationMinutes: true,
          modality: true,
          priceCents: true,
        },
      });
    });

    it('recusa contexto não elegível sem retornar snapshot', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.validateBookingEligibility({
          serviceId: 'service-id',
          clinicId: 'wrong-clinic',
          professionalId: 'professional-id',
          }),
      ).rejects.toMatchObject({
        response: { code: 'SERVICE_NOT_AVAILABLE' },
      });
    });

    it('usa a transação fornecida em vez do Prisma global', async () => {
      const txFindFirst = jest.fn().mockResolvedValue(serviceSnapshot);
      const tx = { service: { findFirst: txFindFirst } } as unknown as Prisma.TransactionClient;
      const result = await service.validateBookingEligibility(
        {
          serviceId: 'service-id',
          clinicId: 'clinic-id',
          professionalId: 'professional-id',
          },
        tx,
      );

      expect(result).toEqual(serviceSnapshot);
      expect(txFindFirst).toHaveBeenCalledTimes(1);
      expect(findFirst).not.toHaveBeenCalled();
    });
  });

  describe('validateProfessional', () => {
    const findFirst = jest.fn();
    const prisma = {
      professional: { findFirst },
    } as unknown as PrismaService;
    let service: ProfessionalsService;

    beforeEach(() => {
      jest.clearAllMocks();
      service = new ProfessionalsService(prisma, { record: jest.fn() } as unknown as AuditService);
    });

    it('retorna snapshot de profissional aprovado e usuário ativo', async () => {
      findFirst.mockResolvedValue({
        id: 'professional-id',
        crm: '12345',
        crmState: 'PE',
        specialty: { name: 'Clínica médica' },
        user: { name: 'Dra. Teste' },
      });
      await expect(service.validateProfessional('professional-id')).resolves.toEqual({
        id: 'professional-id',
        name: 'Dra. Teste',
        crm: '12345',
        crmState: 'PE',
        specialty: 'Clínica médica',
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'professional-id',
          verificationStatus: VerificationStatus.APPROVED,
          user: { status: UserStatus.ACTIVE },
        },
        select: {
          id: true,
          crm: true,
          crmState: true,
          specialty: { select: { name: true } },
          user: { select: { name: true } },
        },
      });
    });

    it('recusa profissional pendente, suspenso ou inativo', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        service.validateProfessional('professional-id'),
      ).rejects.toMatchObject({
        response: { code: 'PROFESSIONAL_NOT_AVAILABLE' },
      });
    });

    it('aceita a mesma transação do agendamento', async () => {
      const txFindFirst = jest.fn().mockResolvedValue({
        id: 'professional-id',
        crm: null,
        crmState: null,
        specialty: null,
        user: { name: 'Profissional' },
      });
      const tx = {
        professional: { findFirst: txFindFirst },
      } as unknown as Prisma.TransactionClient;

      const snapshot = await service.validateProfessional('professional-id', tx);
      expect(snapshot.name).toBe('Profissional');
      expect(findFirst).not.toHaveBeenCalled();
      expect(txFindFirst).toHaveBeenCalledTimes(1);
    });
  });
});
