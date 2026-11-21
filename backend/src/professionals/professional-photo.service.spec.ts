import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { detectPhotoType, professionalPhotoUrl } from './professional-photo';
import { ProfessionalPhotoService } from './professional-photo.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe('Foto do médico', () => {
  const prisma = { professional: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() } };
  const storage = { uploadPrivate: jest.fn(), remove: jest.fn(), read: jest.fn() };
  const audit = { record: jest.fn() };
  let service: ProfessionalPhotoService;

  beforeEach(() => {
    jest.resetAllMocks();
    storage.remove.mockResolvedValue(undefined);
    prisma.professional.findUnique.mockResolvedValue({ id: 'pro-id', photoUrl: null, photoStoragePath: 'professionals/pro-id/photo/antiga.jpg', photoUpdatedAt: null });
    prisma.professional.update.mockImplementation(async ({ data }) => ({ id: 'pro-id', photoUrl: null, ...data }));
    service = new ProfessionalPhotoService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      storage as unknown as StorageService,
    );
  });

  it('reconhece JPG e PNG pelo conteúdo, não pelo nome', () => {
    expect(detectPhotoType(JPEG)?.mime).toBe('image/jpeg');
    expect(detectPhotoType(PNG)?.mime).toBe('image/png');
    expect(detectPhotoType(Buffer.from('%PDF-1.4 fingindo ser foto'))).toBeNull();
  });

  it('recusa arquivo que não é imagem', async () => {
    await expect(service.upload('user-id', { buffer: Buffer.from('MZ executável'), size: 12 })).rejects.toMatchObject({
      response: { code: 'PHOTO_INVALID_TYPE' },
    });
    expect(storage.uploadPrivate).not.toHaveBeenCalled();
  });

  it('recusa foto maior que 2 MB', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);
    await expect(service.upload('user-id', { buffer: big, size: big.length })).rejects.toMatchObject({
      response: { code: 'PHOTO_TOO_LARGE' },
    });
  });

  it('troca a foto, apaga a antiga e registra na auditoria', async () => {
    const result = await service.upload('user-id', { buffer: JPEG, size: JPEG.length });

    expect(storage.uploadPrivate.mock.calls[0][0]).toMatchObject({ contentType: 'image/jpeg' });
    expect(storage.remove).toHaveBeenCalledWith('professionals/pro-id/photo/antiga.jpg');
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'PROFESSIONAL_PHOTO_UPDATED', entityId: 'pro-id' });
    expect(result.photoUrl).toMatch(/^\/public\/professionals\/pro-id\/photo\?v=\d+$/);
  });

  it('a foto enviada tem prioridade sobre a da demonstração', () => {
    expect(professionalPhotoUrl({ id: 'a', photoUrl: '/assets/photos/medicos/x.jpg' })).toBe('/assets/photos/medicos/x.jpg');
    expect(
      professionalPhotoUrl({ id: 'a', photoUrl: '/assets/photos/medicos/x.jpg', photoStoragePath: 'p', photoUpdatedAt: new Date(5) }),
    ).toBe('/public/professionals/a/photo?v=5');
  });
});
