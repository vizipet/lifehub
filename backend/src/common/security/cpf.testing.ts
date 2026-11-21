import type { ConfigService } from '@nestjs/config';
import { CpfProtector } from './cpf';

/** Chaves fixas só para testes unitários. */
export const TEST_KEYS: Record<string, string> = {
  CPF_HASH_KEY: 'a'.repeat(64),
  CPF_ENCRYPTION_KEY: 'b'.repeat(64),
  FILE_ENCRYPTION_KEY: 'c'.repeat(64),
};

export const testConfig = { get: (key: string) => TEST_KEYS[key] } as unknown as ConfigService;

export const testCpf = () => new CpfProtector(testConfig);
