export const MAX_OUTBOX_ATTEMPTS = 5;

const BASE_RETRY_DELAY_MS = 60_000;

export function calculateNextOutboxAttempt(
  attemptCount: number,
  now: Date,
): Date | null {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error('Número de tentativas da Outbox inválido.');
  }

  if (attemptCount >= MAX_OUTBOX_ATTEMPTS) {
    return null;
  }

  const delayMs =
    BASE_RETRY_DELAY_MS * 2 ** (attemptCount - 1);

  return new Date(now.getTime() + delayMs);
}