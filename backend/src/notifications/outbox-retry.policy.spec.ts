import {
  calculateNextOutboxAttempt,
  MAX_OUTBOX_ATTEMPTS,
} from './outbox-retry.policy';

describe('Outbox retry policy', () => {
  const now = new Date('2026-10-17T18:00:00.000Z');

  it('permite no máximo cinco tentativas', () => {
    expect(MAX_OUTBOX_ATTEMPTS).toBe(5);
  });

  it('aguarda um minuto após a primeira falha', () => {
    const next = calculateNextOutboxAttempt(1, now);

    expect(next?.toISOString()).toBe(
      '2026-10-17T18:01:00.000Z',
    );
  });

  it('aguarda dois minutos após a segunda falha', () => {
    const next = calculateNextOutboxAttempt(2, now);

    expect(next?.toISOString()).toBe(
      '2026-10-17T18:02:00.000Z',
    );
  });

  it('aguarda quatro minutos após a terceira falha', () => {
    const next = calculateNextOutboxAttempt(3, now);

    expect(next?.toISOString()).toBe(
      '2026-10-17T18:04:00.000Z',
    );
  });

  it('aguarda oito minutos após a quarta falha', () => {
    const next = calculateNextOutboxAttempt(4, now);

    expect(next?.toISOString()).toBe(
      '2026-10-17T18:08:00.000Z',
    );
  });

  it('não agenda nova tentativa após a quinta falha', () => {
    const next = calculateNextOutboxAttempt(5, now);

    expect(next).toBeNull();
  });

  it('rejeita quantidade inválida de tentativas', () => {
    expect(() =>
      calculateNextOutboxAttempt(0, now),
    ).toThrow('Número de tentativas da Outbox inválido.');

    expect(() =>
      calculateNextOutboxAttempt(1.5, now),
    ).toThrow('Número de tentativas da Outbox inválido.');
  });
});