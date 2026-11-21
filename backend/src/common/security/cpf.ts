import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

/** Remove pontuação e devolve só os 11 dígitos. */
export function normalizeCpf(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** Valida tamanho, sequências repetidas e os dois dígitos verificadores. */
export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Exibição segura: ***.***.*89-01 vira "•••.•••.•••-01". */
export function maskCpf(last2: string | null | undefined): string | null {
  return last2 ? `•••.•••.•••-${last2}` : null;
}

export function formatCpf(value: string): string {
  const cpf = normalizeCpf(value);
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export interface ProtectedCpf {
  cpfHash: string;
  cpfEncrypted: string;
  cpfLast2: string;
}

/**
 * O CPF nunca é gravado em texto puro.
 * - cpfHash: HMAC-SHA256 com chave secreta. Permite unicidade e login por CPF
 *   sem revelar o número (um hash simples seria quebrado por força bruta,
 *   porque existem só 10^9 CPFs possíveis).
 * - cpfEncrypted: AES-256-GCM, aberto apenas para o próprio titular
 *   (exportação de dados da LGPD).
 */
@Injectable()
export class CpfProtector {
  constructor(private readonly config: ConfigService) {}

  hash(value: string): string {
    return createHmac('sha256', this.key('CPF_HASH_KEY'))
      .update(normalizeCpf(value))
      .digest('hex');
  }

  protect(value: string): ProtectedCpf {
    const cpf = normalizeCpf(value);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key('CPF_ENCRYPTION_KEY'), iv);
    const encrypted = Buffer.concat([cipher.update(cpf, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      cpfHash: this.hash(cpf),
      cpfEncrypted: `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`,
      cpfLast2: cpf.slice(-2),
    };
  }

  reveal(cpfEncrypted: string | null | undefined): string | null {
    if (!cpfEncrypted) return null;
    const [version, ivHex, tagHex, dataHex] = cpfEncrypted.split(':');
    if (version !== 'v1' || !ivHex || !tagHex || dataHex === undefined) {
      throw new Error('CPF criptografado em formato desconhecido.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key('CPF_ENCRYPTION_KEY'),
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(name: 'CPF_HASH_KEY' | 'CPF_ENCRYPTION_KEY'): Buffer {
    const value = this.config.get<string>(name)?.trim() ?? '';
    if (!/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error(`${name} deve ter 64 caracteres hexadecimais (32 bytes).`);
    }
    return Buffer.from(value, 'hex');
  }
}
