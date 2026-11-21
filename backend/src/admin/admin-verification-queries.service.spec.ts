import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { AdminVerificationQueriesService } from './admin-verification-queries.service';

describe('AdminVerificationQueriesService - limites das consultas', () => {
  const db = {
    user: { findUnique: jest.fn() },
    professional: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    verificationDocument: { findMany: jest.fn(), count: jest.fn() },
  };
  let service: AdminVerificationQueriesService;
  beforeEach(() => {
    jest.resetAllMocks();
    db.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN, status: UserStatus.ACTIVE });
    db.professional.findMany.mockResolvedValue([]);
    db.professional.count.mockResolvedValue(0);
    db.professional.findUnique.mockResolvedValue({ id: 'professional-id' });
    db.verificationDocument.findMany.mockResolvedValue([]);
    db.verificationDocument.count.mockResolvedValue(0);
    service = new AdminVerificationQueriesService(db as unknown as PrismaService);
  });

  it.each([
    { page: 2_147_483_649, limit: 1 },
    { page: 21_474_838, limit: 100 },
    { page: 9_007_199_254_740_992, limit: 1 },
  ])('recusa deslocamento excessivo antes das consultas: %j', async (query) => {
    await expect(service.listPendingProfessionals('admin-id', query)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listProfessionalDocuments('admin-id', 'professional-id', query)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.professional.findMany).not.toHaveBeenCalled();
    expect(db.professional.findUnique).not.toHaveBeenCalled();
    expect(db.verificationDocument.findMany).not.toHaveBeenCalled();
  });

  it('aceita o deslocamento no limite técnico nas duas consultas', async () => {
    const query = { page: 2_147_483_648, limit: 1 };
    await service.listPendingProfessionals('admin-id', query);
    await service.listProfessionalDocuments('admin-id', 'professional-id', query);
    const expected = expect.objectContaining({ skip: 2_147_483_647, take: 1 });
    expect(db.professional.findMany).toHaveBeenCalledWith(expected);
    expect(db.verificationDocument.findMany).toHaveBeenCalledWith(expected);
  });

  it('verifica o administrador atual antes de processar a paginação', async () => {
    db.user.findUnique.mockResolvedValue({ role: UserRole.PATIENT, status: UserStatus.ACTIVE });
    await expect(service.listPendingProfessionals('admin-id', { page: Number.MAX_VALUE, limit: 100 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.professional.findMany).not.toHaveBeenCalled();
  });
});
