import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserStatus } from '../generated/prisma/client';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service';
import { detectPhotoType, MAX_PHOTO_BYTES, professionalPhotoUrl } from './professional-photo';

type UploadedPhoto = { buffer: Buffer; size: number; originalname?: string };

@Injectable()
export class ProfessionalPhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private async mine(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      select: { id: true, photoUrl: true, photoStoragePath: true, photoUpdatedAt: true },
    });
    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Preencha o CRM e a especialidade antes de enviar a foto.',
      });
    }
    return professional;
  }

  /** Troca a foto do médico. O arquivo antigo é apagado depois que o novo está salvo. */
  async upload(userId: string, file: UploadedPhoto | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({ code: 'PHOTO_REQUIRED', message: 'Escolha uma foto.' });
    }
    if (file.size > MAX_PHOTO_BYTES || file.buffer.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException({ code: 'PHOTO_TOO_LARGE', message: 'A foto deve ter no máximo 2 MB.' });
    }
    const type = detectPhotoType(file.buffer);
    if (!type) {
      throw new BadRequestException({ code: 'PHOTO_INVALID_TYPE', message: 'Envie uma foto em JPG, PNG ou WebP.' });
    }

    const professional = await this.mine(userId);
    const storagePath = `professionals/${professional.id}/photo/${randomUUID()}${type.ext}`;
    await this.storage.uploadPrivate({ path: storagePath, data: file.buffer, contentType: type.mime });

    const updated = await this.prisma.professional.update({
      where: { id: professional.id },
      data: { photoStoragePath: storagePath, photoMimeType: type.mime, photoUpdatedAt: new Date() },
      select: { id: true, photoUrl: true, photoStoragePath: true, photoUpdatedAt: true },
    });
    if (professional.photoStoragePath) await this.storage.remove(professional.photoStoragePath).catch(() => undefined);

    await this.audit.record({
      actorId: userId,
      action: 'PROFESSIONAL_PHOTO_UPDATED',
      entityType: 'PROFESSIONAL',
      entityId: professional.id,
      details: { sizeBytes: file.buffer.length, mimeType: type.mime },
    });
    return { photoUrl: professionalPhotoUrl(updated) };
  }

  /** Remove a foto enviada (volta às iniciais). */
  async remove(userId: string) {
    const professional = await this.mine(userId);
    if (!professional.photoStoragePath) return { photoUrl: professionalPhotoUrl(professional) };

    const updated = await this.prisma.professional.update({
      where: { id: professional.id },
      data: { photoStoragePath: null, photoMimeType: null, photoUpdatedAt: new Date() },
      select: { id: true, photoUrl: true, photoStoragePath: true, photoUpdatedAt: true },
    });
    await this.storage.remove(professional.photoStoragePath).catch(() => undefined);
    await this.audit.record({
      actorId: userId,
      action: 'PROFESSIONAL_PHOTO_REMOVED',
      entityType: 'PROFESSIONAL',
      entityId: professional.id,
    });
    return { photoUrl: professionalPhotoUrl(updated) };
  }

  /**
   * Foto para exibir (busca, perfil, painel do admin). Só de contas ativas.
   * O endereço usa o id do médico (impossível de adivinhar) e a foto é algo
   * que o próprio médico escolheu mostrar.
   */
  async read(professionalId: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, user: { status: UserStatus.ACTIVE } },
      select: { photoStoragePath: true, photoMimeType: true },
    });
    if (!professional?.photoStoragePath || !professional.photoMimeType) {
      throw new NotFoundException({ code: 'PHOTO_NOT_FOUND', message: 'Foto não encontrada.' });
    }
    const buffer = await this.storage.read(professional.photoStoragePath);
    return { buffer, mimeType: professional.photoMimeType };
  }
}
