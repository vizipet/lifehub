import type { Modality } from '../generated/prisma/client';

/**
 * Contratos consumidos pelo G2 sem leitura improvisada das tabelas dos domínios
 * de serviços/profissionais. Os campos representam snapshots mínimos para
 * a confirmação de agendamentos, não respostas públicas da API.
 */
export interface ServiceSnapshot {
  id: string;
  clinicId: string;
  name: string;
  durationMinutes: number;
  modality: Modality;
  priceCents: number | null;
}

export interface ProfessionalSnapshot {
  id: string;
  name: string;
  crm: string | null;
  crmState: string | null;
  specialty: string | null;
}

/**
 * A elegibilidade completa depende de TODOS os IDs (serviço, médico e clínica).
 * validateService(id) e validateProfessional(id) isolados não bastam para reservar.
 */
export interface BookingEligibilityInput {
  serviceId: string;
  professionalId: string;
  clinicId: string;
}

/** Snapshot do horário vinculado ao contexto reservado. */
export interface BookingSlotSnapshot {
  id: string;
  clinicId: string;
  professionalId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
}
