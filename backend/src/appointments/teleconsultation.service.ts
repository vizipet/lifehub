import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';

const EARLY_MS = 15 * 60_000;
type DailyRoom = { name?: string; url?: string; privacy?: string; config?: { exp?: number; eject_at_room_exp?: boolean } };

@Injectable()
export class TeleconsultationService {
  constructor(private readonly prisma: PrismaService) {}

  private async daily(key: string, path: string, body?: object) {
    try {
      return await fetch('https://api.daily.co/v1/' + path, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
    } catch {
      throw new ServiceUnavailableException('Não foi possível conectar ao serviço de vídeo. Confira a internet.');
    }
  }

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

    // Somente demonstração acadêmica, com dados fictícios. Não habilitar para atendimento real.
    const key = process.env.DAILY_API_KEY?.trim();
    if (process.env.NODE_ENV === 'production' || process.env.DAILY_DEMO_ENABLED !== 'true' || !key)
      throw new ServiceUnavailableException('Videochamada de demonstração ainda não configurada.');
    const name = 'lh-' + createHmac('sha256', key).update(appointment.id).digest('hex').slice(0, 40);
    const exp = Math.floor(end / 1000);
    const getRoom = () => this.daily(key, 'rooms/' + name);
    let response = await getRoom();
    if (response.status === 404) {
      const created = await this.daily(key, 'rooms', {
        name, privacy: 'private',
        properties: {
          exp, eject_at_room_exp: true, max_participants: 2, enforce_unique_user_ids: true,
          enable_knocking: false, enable_chat: false, enable_screenshare: false,
          enable_prejoin_ui: true, enable_live_captions_ui: false, enable_transcription_storage: false,
          start_video_off: true, start_audio_off: true,
        },
      });
      // Dois participantes podem criar a sala simultaneamente. Releia o mesmo nome.
      response = created.ok ? created : await getRoom();
    }
    if (!response.ok) throw new ServiceUnavailableException('Não foi possível preparar a sala de vídeo.');
    const room = await response.json() as DailyRoom;
    let url: URL;
    try { url = new URL(room.url ?? ''); } catch { throw new ServiceUnavailableException('Sala de vídeo inválida.'); }
    if (room.name !== name || room.privacy !== 'private' || room.config?.exp !== exp ||
        room.config?.eject_at_room_exp !== true || url.protocol !== 'https:' ||
        !/^[a-z0-9-]+\.daily\.co$/i.test(url.hostname) || url.port || url.username || url.password ||
        url.pathname !== '/' + name || url.search || url.hash)
      throw new ServiceUnavailableException('Sala de vídeo inválida.');

    // Revalidar autorização após a chamada externa. Não transmitir dados pessoais ao provedor.
    const current = await this.prisma.appointment.findFirst({
      where: { id: appointment.id, ...scope, status: 'CONFIRMED', serviceModalitySnapshot: 'REMOTE',
        slot: { endsAt: { gt: new Date() } }, holder: { status: 'ACTIVE' },
        professional: { ...('professional' in scope ? scope.professional : {}), verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } },
        clinic: { verificationStatus: 'APPROVED' }, patient: { deletedAt: null } },
      select: { id: true },
    });
    if (!current) throw new ConflictException('A consulta não está mais disponível.');
    const tokenRes = await this.daily(key, 'meeting-tokens', { properties: {
      room_name: name, exp: Math.min(exp, Math.floor(Date.now() / 1000) + 300),
      eject_at_token_exp: false, is_owner: false,
      user_name: role === UserRole.PROFESSIONAL ? 'Médico' : 'Paciente',
      user_id: createHmac('sha256', key).update(appointment.id + ':' + role).digest('hex').slice(0, 32),
      enable_screenshare: false, enable_recording_ui: false, start_cloud_recording: false,
      auto_start_transcription: false, enable_live_captions_ui: false,
      start_video_off: true, start_audio_off: true,
    } });
    if (!tokenRes.ok) throw new ServiceUnavailableException('Não foi possível autorizar a entrada na sala.');
    const result = await tokenRes.json() as { token?: string };
    if (typeof result.token !== 'string' || !result.token) throw new ServiceUnavailableException('Credencial de vídeo inválida.');
    url.searchParams.set('t', result.token);
    return { url: url.toString(), endsAt: appointment.slot.endsAt.toISOString() };
  }
}
