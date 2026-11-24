import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';

const EARLY_MS = 15 * 60_000;

@Injectable()
export class TeleconsultationService {
  constructor(private readonly prisma: PrismaService) {}

  async join(userId: string, role: UserRole, appointmentId: string) {
    const scope = role === UserRole.PATIENT ? { holderId: userId } :
      role === UserRole.PROFESSIONAL ? { professional: { userId } } : null;
    if (!scope) throw new NotFoundException('Consulta não encontrada.');
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId, ...scope, status: 'CONFIRMED', serviceModalitySnapshot: 'REMOTE',
        holder: { status: 'ACTIVE' },
        professional: { ...('professional' in scope ? scope.professional : {}), verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } },
        clinic: { verificationStatus: 'APPROVED' }, patient: { deletedAt: null },
      },
      select: { id: true, slot: { select: { startsAt: true, endsAt: true } } },
    });
    if (!appointment) throw new NotFoundException('Teleconsulta confirmada não encontrada.');
    const now = Date.now();
    const start = appointment.slot.startsAt.getTime();
    const end = appointment.slot.endsAt.getTime();
    if (now < start - EARLY_MS || now >= end)
      throw new ConflictException('A sala abre 15 minutos antes e fecha no término previsto da consulta.');

    // Demonstração acadêmica, apenas dados fictícios. Segredo nunca sai do backend.
    const key = process.env.LIVEKIT_API_KEY?.trim();
    const secret = process.env.LIVEKIT_API_SECRET?.trim();
    const server = process.env.LIVEKIT_URL?.trim();
    if (process.env.NODE_ENV === 'production' || process.env.LIVEKIT_DEMO_ENABLED !== 'true' ||
        !key || !secret || !server || !/^wss:\/\/[a-z0-9-]+\.livekit\.cloud$/i.test(server))
      throw new ServiceUnavailableException('Videochamada de demonstração ainda não configurada.');
    const room = 'lh-' + createHmac('sha256', secret).update(appointment.id).digest('hex').slice(0, 40);
    const identity = createHmac('sha256', secret).update(appointment.id + ':' + role).digest('hex').slice(0, 32);
    const seconds = Math.floor(now / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({
      iss: key, sub: identity, name: role === UserRole.PROFESSIONAL ? 'Médico' : 'Paciente',
      nbf: seconds - 5, exp: Math.min(Math.floor(end / 1000), seconds + 300),
      video: { roomJoin: true, room, canPublish: true, canSubscribe: true,
        canPublishSources: ['camera', 'microphone'], canPublishData: false },
    });
    const unsigned = header + '.' + payload;
    const token = unsigned + '.' + createHmac('sha256', secret).update(unsigned).digest('base64url');
    const url = new URL('https://meet.livekit.io/custom');
    url.searchParams.set('liveKitUrl', server);
    url.searchParams.set('token', token);
    return { url: url.toString(), endsAt: appointment.slot.endsAt.toISOString() };
  }
}
