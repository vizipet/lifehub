import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronSecretGuard } from './cron-secret.guard';

describe('CronSecretGuard - autenticação e rotação G6.2', () => {
  // Deliberately artificial fixtures; never use these values outside tests.
  const current = 'a'.repeat(64);
  const previous = 'b'.repeat(64);
  const now = Date.UTC(2026, 9, 18, 12);
  let values: Record<string, unknown>;
  let guard: CronSecretGuard;

  function context(authorization?: string, rawHeaders?: string[]): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization },
          rawHeaders: rawHeaders ?? (authorization ? ['Authorization', authorization] : []),
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    values = { CRON_SECRET: current };
    guard = new CronSecretGuard({ get: (key: string) => values[key] } as unknown as ConfigService);
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it.each([32, 64, 128])('aceita segredo atual válido com %s caracteres', (size) => {
    values.CRON_SECRET = 'a'.repeat(size);
    expect(guard.canActivate(context(`Bearer ${'a'.repeat(size)}`))).toBe(true);
  });

  it.each([
    undefined, '', 'Basic abc', `Bearer ${'c'.repeat(64)}`,
    `Bearer ${'c'.repeat(32)}`, `Bearer ${'a'.repeat(129)}`,
    `Bearer ${current} extra`, `Bearer  ${current}`, `Bearer ${current}, Bearer ${previous}`,
    'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
  ])('recusa credencial ausente, incorreta ou malformada: %s', (authorization) => {
    expect(() => guard.canActivate(context(authorization))).toThrow(UnauthorizedException);
  });

  it('aceita o nome Bearer sem exigir capitalização específica', () => {
    expect(guard.canActivate(context(`bearer ${current}`))).toBe(true);
  });

  it('recusa cabeçalhos Authorization duplicados mesmo se o primeiro é válido', () => {
    expect(() => guard.canActivate(context(`Bearer ${current}`, [
      'Authorization', `Bearer ${current}`, 'authorization', `Bearer ${previous}`,
    ]))).toThrow(UnauthorizedException);
  });

  it.each([undefined, '', 'short', 'a'.repeat(129), ' '.repeat(64), `${current}\n`, 123])(
    'desabilita a entrada quando o segredo atual é inválido: %s', (value) => {
      values.CRON_SECRET = value;
      expect(() => guard.canActivate(context(`Bearer ${current}`)))
        .toThrow(ServiceUnavailableException);
    },
  );

  it('permite campos de rotação vazios enquanto só a chave atual está ativa', () => {
    values.CRON_SECRET_PREVIOUS = '';
    values.CRON_SECRET_PREVIOUS_EXPIRES_AT = '';
    expect(guard.canActivate(context(`Bearer ${current}`))).toBe(true);
  });

  it('aceita as duas chaves antes do prazo configurado', () => {
    values.CRON_SECRET_PREVIOUS = previous;
    values.CRON_SECRET_PREVIOUS_EXPIRES_AT = new Date(now + 1).toISOString();
    expect(guard.canActivate(context(`Bearer ${current}`))).toBe(true);
    expect(guard.canActivate(context(`Bearer ${previous}`))).toBe(true);
  });

  it.each([0, -1])('recusa chave anterior no prazo ou depois dele: %s ms', (offset) => {
    values.CRON_SECRET_PREVIOUS = previous;
    values.CRON_SECRET_PREVIOUS_EXPIRES_AT = new Date(now + offset).toISOString();
    expect(() => guard.canActivate(context(`Bearer ${previous}`))).toThrow(UnauthorizedException);
    expect(guard.canActivate(context(`Bearer ${current}`))).toBe(true);
  });

  it.each([
    { CRON_SECRET_PREVIOUS: previous },
    { CRON_SECRET_PREVIOUS_EXPIRES_AT: new Date(now + 1000).toISOString() },
    { CRON_SECRET_PREVIOUS: current, CRON_SECRET_PREVIOUS_EXPIRES_AT: new Date(now + 1000).toISOString() },
    { CRON_SECRET_PREVIOUS: 'short', CRON_SECRET_PREVIOUS_EXPIRES_AT: new Date(now + 1000).toISOString() },
    { CRON_SECRET_PREVIOUS: previous, CRON_SECRET_PREVIOUS_EXPIRES_AT: 'invalid' },
    { CRON_SECRET_PREVIOUS: previous, CRON_SECRET_PREVIOUS_EXPIRES_AT: '2026-02-30T12:00:00.000Z' },
    { CRON_SECRET_PREVIOUS: previous, CRON_SECRET_PREVIOUS_EXPIRES_AT: '2026-10-18T12:00:00Z' },
  ])('recusa configuração de rotação incompleta ou inválida: %j', (rotation) => {
    Object.assign(values, rotation);
    expect(() => guard.canActivate(context(`Bearer ${current}`)))
      .toThrow(ServiceUnavailableException);
  });

  it('remove imediatamente a aceitação da chave anterior quando a configuração é limpa', () => {
    values.CRON_SECRET_PREVIOUS = previous;
    values.CRON_SECRET_PREVIOUS_EXPIRES_AT = new Date(now + 1000).toISOString();
    expect(guard.canActivate(context(`Bearer ${previous}`))).toBe(true);
    delete values.CRON_SECRET_PREVIOUS;
    delete values.CRON_SECRET_PREVIOUS_EXPIRES_AT;
    expect(() => guard.canActivate(context(`Bearer ${previous}`))).toThrow(UnauthorizedException);
    expect(guard.canActivate(context(`Bearer ${current}`))).toBe(true);
  });
});
