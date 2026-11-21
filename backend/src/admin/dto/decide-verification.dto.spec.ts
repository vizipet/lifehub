import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DecideVerificationDto } from './decide-verification.dto';
import { VERIFICATION_DECISIONS } from '../../notifications/verification-decision.event';

describe('DecideVerificationDto', () => {
  const valid = { decision: 'APPROVED', reason: 'Perfil conferido.', expectedSubmittedAt: '2026-10-18T12:00:00.000Z' };
  const errors = (input: object) => validate(plainToInstance(DecideVerificationDto, input), {
    whitelist: true, forbidNonWhitelisted: true,
  });
  it.each(VERIFICATION_DECISIONS)('aceita decisão %s com motivo e data', async (decision) => {
    expect(await errors({ ...valid, decision })).toEqual([]);
  });
  it('normaliza espaços externos do motivo', async () => {
    const dto = plainToInstance(DecideVerificationDto, { ...valid, reason: '  Justificativa.  ' });
    expect(dto.reason).toBe('Justificativa.');
    expect(await validate(dto)).toEqual([]);
  });
  it.each([undefined, null, '', '   ', 42, 'x'.repeat(2001)])('rejeita motivo inválido: %s', async (reason) => {
    expect((await errors({ ...valid, reason })).some((error) => error.property === 'reason')).toBe(true);
  });
  it.each(['PENDING', 'SUSPENDED', 'approve', undefined])('rejeita decisão inválida: %s', async (decision) => {
    expect((await errors({ ...valid, decision })).some((error) => error.property === 'decision')).toBe(true);
  });
  it.each([undefined, 'invalid', '2026-02-30T12:00:00.000Z'])('rejeita data inválida: %s', async (expectedSubmittedAt) => {
    expect((await errors({ ...valid, expectedSubmittedAt })).some((error) => error.property === 'expectedSubmittedAt')).toBe(true);
  });
  it('recusa autor, status e campos extras enviados no corpo', async () => {
    const result = await errors({ ...valid, actorId: 'untrusted', verificationStatus: 'APPROVED' });
    expect(result.map((error) => error.property).sort()).toEqual(['actorId', 'verificationStatus']);
  });
});
