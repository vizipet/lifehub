import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { StorageService, StorePrivateFileInput } from './storage.service';

const MAGIC = Buffer.from('LHF1'); // LifeHub File v1

/**
 * Armazenamento privado em disco, sem serviço externo.
 * Cada arquivo é criptografado com AES-256-GCM (chave FILE_ENCRYPTION_KEY):
 * quem copiar a pasta não consegue abrir os documentos dos médicos.
 * Formato: "LHF1" | iv (12) | tag (16) | dados criptografados.
 */
@Injectable()
export class LocalDiskStorageService implements StorageService {
  constructor(private readonly config: ConfigService) {}

  async uploadPrivate(input: StorePrivateFileInput): Promise<void> {
    const target = this.resolveSafe(input.path);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(input.data), cipher.final()]);
    const payload = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);

    try {
      await mkdir(dirname(target), { recursive: true });
      // 'wx' falha se o arquivo já existir: nunca sobrescreve um documento.
      await writeFile(target, payload, { flag: 'wx', mode: 0o600 });
    } catch {
      throw new InternalServerErrorException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Não foi possível armazenar o arquivo privado.',
      });
    }
  }

  async read(path: string): Promise<Buffer> {
    const target = this.resolveSafe(path);
    let payload: Buffer;
    try {
      payload = await readFile(target);
    } catch {
      throw new NotFoundException({
        code: 'STORAGE_FILE_NOT_FOUND',
        message: 'Arquivo não encontrado.',
      });
    }

    try {
      if (!payload.subarray(0, 4).equals(MAGIC)) throw new Error('formato');
      const iv = payload.subarray(4, 16);
      const tag = payload.subarray(16, 32);
      const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(payload.subarray(32)), decipher.final()]);
    } catch {
      throw new InternalServerErrorException({
        code: 'STORAGE_FILE_CORRUPTED',
        message: 'Não foi possível abrir o arquivo privado.',
      });
    }
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolveSafe(path), { force: true });
  }

  private root(): string {
    const configured = this.config.get<string>('STORAGE_DIR')?.trim() || './storage';
    return resolve(process.cwd(), configured);
  }

  /** Impede "../" e caminhos absolutos: o arquivo fica sempre dentro da pasta. */
  private resolveSafe(path: string): string {
    const segments = path.split('/');
    if (
      !path ||
      isAbsolute(path) ||
      segments.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))
    ) {
      throw new InternalServerErrorException({
        code: 'STORAGE_INVALID_PATH',
        message: 'Caminho de arquivo inválido.',
      });
    }
    const root = this.root();
    const target = resolve(join(root, ...segments));
    const rel = relative(root, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new InternalServerErrorException({
        code: 'STORAGE_INVALID_PATH',
        message: 'Caminho de arquivo inválido.',
      });
    }
    return target;
  }

  private key(): Buffer {
    const value = this.config.get<string>('FILE_ENCRYPTION_KEY')?.trim() ?? '';
    if (!/^[0-9a-f]{64}$/i.test(value)) {
      throw new InternalServerErrorException({
        code: 'STORAGE_NOT_CONFIGURED',
        message: 'FILE_ENCRYPTION_KEY ausente ou inválida.',
      });
    }
    return Buffer.from(value, 'hex');
  }
}
