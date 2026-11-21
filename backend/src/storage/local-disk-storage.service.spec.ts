import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { LocalDiskStorageService } from './local-disk-storage.service';

describe('LocalDiskStorageService (arquivos privados criptografados)', () => {
  let dir: string;
  let storage: LocalDiskStorageService;
  const keys: Record<string, string> = { FILE_ENCRYPTION_KEY: 'c'.repeat(64) };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lifehub-storage-'));
    keys.STORAGE_DIR = dir;
    storage = new LocalDiskStorageService({ get: (key: string) => keys[key] } as unknown as ConfigService);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('grava criptografado e lê de volta o conteúdo original', async () => {
    const original = Buffer.from('%PDF-1.4 CARTEIRA CRM 123456/PE');
    await storage.uploadPrivate({ path: 'professionals/p1/doc.pdf', data: original, contentType: 'application/pdf' });

    const onDisk = readFileSync(join(dir, 'professionals', 'p1', 'doc.pdf'));
    expect(onDisk.subarray(0, 4).toString()).toBe('LHF1');
    expect(onDisk.toString('latin1')).not.toContain('CARTEIRA CRM');

    await expect(storage.read('professionals/p1/doc.pdf')).resolves.toEqual(original);
  });

  it('nunca sobrescreve um documento existente', async () => {
    const input = { path: 'a/doc.png', data: Buffer.from('1'), contentType: 'image/png' };
    await storage.uploadPrivate(input);
    await expect(storage.uploadPrivate(input)).rejects.toMatchObject({ response: { code: 'STORAGE_UPLOAD_FAILED' } });
  });

  it.each(['../fora.txt', 'a/../../fora.txt', '/etc/passwd', 'a//b', 'a\\b'])('bloqueia caminho perigoso %s', async (path) => {
    await expect(storage.read(path)).rejects.toMatchObject({ response: { code: 'STORAGE_INVALID_PATH' } });
  });

  it('detecta arquivo adulterado', async () => {
    await storage.uploadPrivate({ path: 'a/doc.pdf', data: Buffer.from('conteúdo'), contentType: 'application/pdf' });
    const file = join(dir, 'a', 'doc.pdf');
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] ^= 0xff;
    require('node:fs').writeFileSync(file, bytes);
    await expect(storage.read('a/doc.pdf')).rejects.toMatchObject({ response: { code: 'STORAGE_FILE_CORRUPTED' } });
  });

  it('recusa operar sem chave de criptografia válida', async () => {
    keys.FILE_ENCRYPTION_KEY = 'curta';
    await expect(
      storage.uploadPrivate({ path: 'a/doc.pdf', data: Buffer.from('x'), contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ response: { code: 'STORAGE_NOT_CONFIGURED' } });
    keys.FILE_ENCRYPTION_KEY = 'c'.repeat(64);
  });
});
