import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service';
import { MAX_VERIFICATION_FILE_SIZE_BYTES } from '../verification/verification-file.validator';

/** Lê um documento de verificação do armazenamento privado (após autorização). */
@Injectable()
export class AdminDocumentReader {
  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  async read(storagePath: string): Promise<Buffer> {
    let content: Buffer;
    try {
      content = await this.storage.read(storagePath);
    } catch {
      throw this.unavailable();
    }
    if (content.length === 0 || content.length > MAX_VERIFICATION_FILE_SIZE_BYTES) {
      throw this.unavailable();
    }
    return content;
  }

  private unavailable() {
    return new BadGatewayException({
      code: 'VERIFICATION_DOCUMENT_CONTENT_UNAVAILABLE',
      message: 'Não foi possível obter o conteúdo privado do documento.',
    });
  }
}
