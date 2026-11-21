import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export const PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED';
export const resetDigest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export interface ResetContext {
  version: number;
  tokenId: string;
  userId: string;
  emailHash: string;
  credentialHash: string;
}

export function resetContext(payload: unknown): ResetContext {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('INVALID_RESET_EVENT');
  const value = payload as Record<string, unknown>;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hash = /^[0-9a-f]{64}$/;
  if (
    value.version !== 1 ||
    typeof value.tokenId !== 'string' ||
    !uuid.test(value.tokenId) ||
    typeof value.userId !== 'string' ||
    !uuid.test(value.userId) ||
    typeof value.emailHash !== 'string' ||
    !hash.test(value.emailHash) ||
    typeof value.credentialHash !== 'string' ||
    !hash.test(value.credentialHash)
  )
    throw new Error('INVALID_RESET_EVENT');
  return {
    version: 1,
    tokenId: value.tokenId,
    userId: value.userId,
    emailHash: value.emailHash,
    credentialHash: value.credentialHash,
  };
}

@Injectable()
export class PasswordResetEnvelope {
  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    this.key();
  }

  seal(token: string, context: ResetContext): Record<string, unknown> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(this.aad(context));
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return {
      ...context,
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
  }

  open(payload: unknown): string {
    const context = resetContext(payload);
    const value = payload as Record<string, unknown>;
    if (
      typeof value.iv !== 'string' ||
      !/^[0-9a-f]{24}$/.test(value.iv) ||
      typeof value.tag !== 'string' ||
      !/^[0-9a-f]{32}$/.test(value.tag) ||
      typeof value.ciphertext !== 'string' ||
      !/^[0-9a-f]{128}$/.test(value.ciphertext)
    )
      throw new Error('INVALID_RESET_EVENT');
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(value.iv, 'hex'),
      );
      decipher.setAAD(this.aad(context));
      decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
      const token = Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'hex')),
        decipher.final(),
      ]).toString('utf8');
      if (!/^[A-Za-z0-9_-]{64}$/.test(token))
        throw new Error('INVALID_RESET_EVENT');
      return token;
    } catch {
      // Never expose ciphertext, token, key or cryptographic error details.
      throw new Error('RESET_ENVELOPE_UNAVAILABLE');
    }
  }

  private key(): Buffer {
    const key = this.config.get<string>('PASSWORD_RESET_ENCRYPTION_KEY');
    if (!key || !/^[0-9a-fA-F]{64}$/.test(key))
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RESET_UNAVAILABLE',
        message: 'Recuperação de senha temporariamente indisponível.',
      });
    return Buffer.from(key, 'hex');
  }

  private aad(context: ResetContext): Buffer {
    return Buffer.from(
      JSON.stringify([
        PASSWORD_RESET_REQUESTED,
        context.version,
        context.tokenId,
        context.userId,
        context.emailHash,
        context.credentialHash,
      ]),
    );
  }
}
