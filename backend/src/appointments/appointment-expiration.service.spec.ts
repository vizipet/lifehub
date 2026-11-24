import { AppointmentExpirationService, expiredWithoutAttendance } from './appointment-expiration.service';
import type { PrismaService } from '../common/prisma/prisma.service';

describe('AppointmentExpirationService', () => {
  it('cancela somente confirmadas sem presença nem vínculo conferido após a tolerância', async () => {
    const now = new Date('2026-11-24T05:00:00Z');
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new AppointmentExpirationService({ appointment: { updateMany } } as unknown as PrismaService);
    await expect(service.expire(now)).resolves.toEqual({ count: 1 });
    expect(expiredWithoutAttendance(now)).toEqual({
      status: 'CONFIRMED', attendanceRecordedAt: null,
      OR: [{ dependentCheckResult: null }, { dependentCheckResult: 'MISMATCH' }],
      slot: { endsAt: { lte: new Date('2026-11-24T04:30:00Z') } },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { AND: [{}, expiredWithoutAttendance(now)] },
      data: { status: 'CANCELLED_AUTOMATICALLY', cancelledAt: now, cancellationReason: expect.any(String) },
    });
  });
});
