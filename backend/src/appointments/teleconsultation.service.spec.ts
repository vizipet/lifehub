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
  it('emite credenciais distintas para a mesma sala, sem dados pessoais', async () => {
    const original = { ...process.env };
    try {
      process.env.NODE_ENV = 'test';
      process.env.LIVEKIT_DEMO_ENABLED = 'true';
      process.env.LIVEKIT_URL = 'wss://demo.livekit.cloud';
      process.env.LIVEKIT_API_KEY = 'test-key';
      process.env.LIVEKIT_API_SECRET = 'test-secret';
      findFirst.mockResolvedValue({ id: 'appointment', slot: { startsAt: new Date(Date.now() + 60000), endsAt: new Date(Date.now() + 1800000) } });
      const patient = await service.join('holder', UserRole.PATIENT, 'appointment');
      const doctor = await service.join('doctor', UserRole.PROFESSIONAL, 'appointment');
      const decode = (url: string) => {
        const parsed = new URL(url);
        expect(parsed.origin).toBe('https://meet.livekit.io');
        expect(parsed.searchParams.get('liveKitUrl')).toBe('wss://demo.livekit.cloud');
        return JSON.parse(Buffer.from(parsed.searchParams.get('token')!.split('.')[1], 'base64url').toString());
      };
      const p = decode(patient.url), d = decode(doctor.url);
      expect(p.video.room).toBe(d.video.room);
      expect(p.sub).not.toBe(d.sub);
      expect(p.video.canPublishSources).toEqual(['camera', 'microphone']);
      expect(p.video.roomJoin).toBe(true);
      expect(p.exp).toBeLessThanOrEqual(Math.floor(Date.parse(patient.endsAt) / 1000));
      expect(patient.url).not.toContain('test-secret');
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
      Object.assign(process.env, original);
    }
  });
  it('nega acesso fora do horário', async () => {
    findFirst.mockResolvedValue({ id: 'appointment', slot: { startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000) } });
    await expect(service.join('holder', UserRole.PATIENT, 'appointment')).rejects.toMatchObject({ status: 409 });
  });
});
