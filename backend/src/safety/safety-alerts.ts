import type { Prisma, SafetyAlertKind } from '../generated/prisma/client';

type AlertClient = {
  safetyAlert: {
    findFirst(args: Prisma.SafetyAlertFindFirstArgs): Promise<{ id: string } | null>;
    create(args: Prisma.SafetyAlertCreateArgs): Promise<{ id: string }>;
  };
};

/** Quantas crianças a mesma conta pode cadastrar em 24 h antes de virar alerta. */
export const MANY_MINORS_THRESHOLD = 3;
export const MANY_MINORS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Abre um alerta para a administração. Se já houver um alerta aberto do mesmo
 * tipo para a mesma pessoa (ou consulta), não duplica.
 * Os detalhes nunca devem conter CPF.
 */
export async function openSafetyAlert(
  client: AlertClient,
  input: {
    kind: SafetyAlertKind;
    holderId: string;
    patientId?: string;
    appointmentId?: string;
    details?: Prisma.InputJsonObject;
  },
) {
  const existing = await client.safetyAlert.findFirst({
    where: {
      kind: input.kind,
      holderId: input.holderId,
      status: 'OPEN',
      ...(input.patientId && { patientId: input.patientId }),
      ...(input.appointmentId && { appointmentId: input.appointmentId }),
    },
    select: { id: true },
  });
  if (existing) return existing;

  return client.safetyAlert.create({
    data: {
      kind: input.kind,
      holderId: input.holderId,
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      details: input.details ?? {},
    },
    select: { id: true },
  });
}
