import { TeleconsultationService } from './teleconsultation.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';

describe('TeleconsultationService', () => {
  const findFirst = jest.fn();
  const service = new TeleconsultationService({ appointment: { findFirst } } as unknown as PrismaService);
  beforeEach(() => { jest.clearAllMocks(); });
  it('restringe a consulta ao titular, ao status confirmado e à modalidade remota', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.join('holder', UserRole.PATIENT, 'appointment')).rejects.toMatchObject({ status: 404 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ holderId: 'holder', status: 'CONFIRMED', serviceModalitySnapshot: 'REMOTE' }) }));
  });
  it('restringe a consulta ao médico responsável aprovado', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.join('doctor', UserRole.PROFESSIONAL, 'appointment')).rejects.toMatchObject({ status: 404 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ professional: expect.objectContaining({ userId: 'doctor', verificationStatus: 'APPROVED' }) }) }));
  });
  it('nega acesso fora do horário', async () => {
    findFirst.mockResolvedValue({ id: 'appointment', slot: { startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000) } });
    await expect(service.join('holder', UserRole.PATIENT, 'appointment')).rejects.toMatchObject({ status: 409 });
  });
});
