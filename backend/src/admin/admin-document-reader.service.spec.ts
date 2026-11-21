import { BadGatewayException } from '@nestjs/common';
import type { StorageService } from '../storage/storage.service';
import { AdminDocumentReader } from './admin-document-reader.service';

describe('AdminDocumentReader', () => {
  const storage = { uploadPrivate: jest.fn(), read: jest.fn(), remove: jest.fn() };
  const reader = new AdminDocumentReader(storage as unknown as StorageService);

  beforeEach(() => jest.resetAllMocks());

  it('devolve o conteúdo lido do armazenamento privado', async () => {
    storage.read.mockResolvedValue(Buffer.from('%PDF-1.4'));
    await expect(reader.read('professionals/p/verification/doc.pdf')).resolves.toEqual(Buffer.from('%PDF-1.4'));
    expect(storage.read).toHaveBeenCalledWith('professionals/p/verification/doc.pdf');
  });

  it('não repassa detalhes internos quando o arquivo falha', async () => {
    storage.read.mockRejectedValue(new Error('caminho interno /storage/x'));
    await expect(reader.read('x')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('recusa arquivo vazio', async () => {
    storage.read.mockResolvedValue(Buffer.alloc(0));
    await expect(reader.read('x')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
