import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  PasswordResetEnvelope,
  resetContext,
  resetDigest,
} from './password-reset-envelope';

describe('PasswordResetEnvelope', () => {
  const key = '12'.repeat(32); // Fictitious, test-only key.
  const config = new ConfigService({ PASSWORD_RESET_ENCRYPTION_KEY: key });
  const envelope = new PasswordResetEnvelope(config);
  const context = {
    version: 1,
    tokenId: randomUUID(),
    userId: randomUUID(),
    emailHash: resetDigest('fiction@vizipet.test'),
    credentialHash: resetDigest('fake-hash'),
  };
  const token = randomBytes(48).toString('base64url');

  it('cifra com nonces distintos e recupera o token apenas com a chave correta', () => {
    const first = envelope.seal(token, context);
    const second = envelope.seal(token, context);
    expect(first.iv).not.toEqual(second.iv);
    expect(JSON.stringify(first)).not.toContain(token);
    expect(envelope.open(first)).toEqual(token);
    expect(resetContext(first)).toEqual(context);
  });

  it.each([
    'tokenId',
    'userId',
    'emailHash',
    'credentialHash',
    'tag',
    'ciphertext',
  ])('rejeita adulteração de %s', (field) => {
    const payload = envelope.seal(token, context);
    const old = payload[field] as string;
    payload[field] = (old[0] === '0' ? '1' : '0') + old.slice(1);
    expect(() => envelope.open(payload)).toThrow();
  });

  it('não aceita outra chave', () => {
    const other = new PasswordResetEnvelope(
      new ConfigService({ PASSWORD_RESET_ENCRYPTION_KEY: '34'.repeat(32) }),
    );
    expect(() => other.open(envelope.seal(token, context))).toThrow(
      'RESET_ENVELOPE_UNAVAILABLE',
    );
  });

  it.each([undefined, '', 'bad', 'aa'.repeat(31)])(
    'falha de forma segura para configuração inválida',
    (value) => {
      const invalid = new PasswordResetEnvelope(
        new ConfigService({ PASSWORD_RESET_ENCRYPTION_KEY: value }),
      );
      expect(() => invalid.assertConfigured()).toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it.each([null, [], {}, { ...context, version: 2 }])(
    'rejeita formatos sem contexto válido',
    (payload) => {
      expect(() => envelope.open(payload)).toThrow('INVALID_RESET_EVENT');
    },
  );
});
