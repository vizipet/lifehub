import { AuditService } from '../audit/audit.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProfessionalsService } from './professionals.service';

describe('ProfessionalsService', () => {
  const prisma = {
    professional: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    specialty: { findFirst: jest.fn() },
  };
  let service: ProfessionalsService;

  const dto = { crm: '123456', crmState: 'PE', specialtyId: 'specialty-id', bio: 'Clínico geral.' };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ProfessionalsService(prisma as unknown as PrismaService, { record: jest.fn() } as unknown as AuditService);
    prisma.specialty.findFirst.mockResolvedValue({ id: 'specialty-id' });
    prisma.professional.update.mockResolvedValue({ id: 'professional-id', specialty: null });
  });

  it('retorna o perfil do médico logado com a especialidade', async () => {
    prisma.professional.findUnique.mockResolvedValue({ id: 'professional-id', userId: 'user-id' });
    await expect(service.findMine('user-id')).resolves.toEqual({ id: 'professional-id', userId: 'user-id' });
    expect(prisma.professional.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      include: { specialty: { select: { id: true, code: true, name: true } } },
    });
  });

  it('retorna 404 quando o perfil ainda não foi criado', async () => {
    prisma.professional.findUnique.mockResolvedValue(null);
    await expect(service.findMine('user-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cria perfil com CRM, UF e especialidade', async () => {
    prisma.professional.findUnique.mockResolvedValue(null);
    prisma.professional.findFirst.mockResolvedValue(null);
    prisma.professional.create.mockResolvedValue({ id: 'professional-id' });

    await service.createMine('user-id', dto);

    expect(prisma.professional.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 'user-id', crm: '123456', crmState: 'PE', specialtyId: 'specialty-id', bio: 'Clínico geral.' },
      }),
    );
  });

  it('recusa especialidade inexistente ou inativa', async () => {
    prisma.professional.findUnique.mockResolvedValue(null);
    prisma.specialty.findFirst.mockResolvedValue(null);
    await expect(service.createMine('user-id', dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.professional.create).not.toHaveBeenCalled();
  });

  it('recusa CRM já cadastrado por outro médico', async () => {
    prisma.professional.findUnique.mockResolvedValue(null);
    prisma.professional.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.createMine('user-id', dto)).rejects.toMatchObject({
      response: { code: 'CRM_ALREADY_REGISTERED' },
    });
  });

  it('recusa segundo perfil para o mesmo usuário', async () => {
    prisma.professional.findUnique.mockResolvedValue({ id: 'professional-id' });
    await expect(service.createMine('user-id', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('volta para análise quando o CRM muda', async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'professional-id',
      crm: '123456',
      crmState: 'PE',
      verificationStatus: VerificationStatus.APPROVED,
    });
    prisma.professional.findFirst.mockResolvedValue(null);

    await service.updateMine('user-id', { crm: '654321' });

    expect(prisma.professional.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crm: '654321',
          verificationStatus: VerificationStatus.PENDING,
          verificationSubmittedAt: null,
        }),
      }),
    );
  });

  it('muda especialidade e apresentação sem nova análise', async () => {
    prisma.professional.findUnique.mockResolvedValue({ id: 'professional-id', crm: '123456', crmState: 'PE' });

    await service.updateMine('user-id', { specialtyId: 'specialty-id', bio: 'Nova apresentação.' });

    const data = prisma.professional.update.mock.calls[0][0].data;
    expect(data).toEqual({ specialtyId: 'specialty-id', bio: 'Nova apresentação.' });
  });

  it('perfil público só existe para médico aprovado', async () => {
    prisma.professional.findFirst.mockResolvedValue(null);
    await expect(service.findPublic('professional-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.professional.findFirst.mock.calls[0][0].where).toMatchObject({
      verificationStatus: VerificationStatus.APPROVED,
    });
  });
});
