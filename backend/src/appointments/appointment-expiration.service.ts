import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';

export const ATTENDANCE_GRACE_MS = 30 * 60_000;
export const ATTENDANCE_EARLY_MS = 15 * 60_000;
export const AUTO_CANCELLATION_REASON = 'Cancelamento automático: presença não registrada no prazo.';

export function expiredWithoutAttendance(now: Date): Prisma.AppointmentWhereInput {
  return {
    status: 'CONFIRMED',
    attendanceRecordedAt: null,
    // A conferência presencial do vínculo também é evidência de presença.
    OR: [{ dependentCheckResult: null }, { dependentCheckResult: 'MISMATCH' }],
    slot: { endsAt: { lte: new Date(now.getTime() - ATTENDANCE_GRACE_MS) } },
  };
}

@Injectable()
export class AppointmentExpirationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AppointmentExpirationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}

  async expire(now = new Date(), scope: Prisma.AppointmentWhereInput = {}) {
    return this.prisma.appointment.updateMany({
      where: { AND: [scope, expiredWithoutAttendance(now)] },
      data: { status: 'CANCELLED_AUTOMATICALLY', cancelledAt: now, cancellationReason: AUTO_CANCELLATION_REASON },
    });
    // Horários passados não são liberados para novas reservas.
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.expire(); }
    catch (error) { this.logger.error('Falha ao expirar consultas sem presença registrada', error instanceof Error ? error.message : 'Erro desconhecido'); }
    finally { this.running = false; }
  }

  async onApplicationBootstrap() {
    await this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }
}
