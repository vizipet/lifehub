import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.service';
import {
  validateVerificationFile,
  type VerificationUploadFile,
} from './verification-file.validator';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async uploadDocument(
    userId: string,
    file: VerificationUploadFile,
  ) {
    const professional =
      await this.prisma.professional.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
          verificationStatus: true,
          verificationSubmittedAt: true,
        },
      });

    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Perfil profissional não encontrado.',
      });
    }

    if (
      professional.verificationStatus ===
        VerificationStatus.APPROVED ||
      professional.verificationStatus ===
        VerificationStatus.REJECTED ||
      professional.verificationStatus ===
        VerificationStatus.SUSPENDED
    ) {
      throw new ConflictException({
        code: 'VERIFICATION_DOCUMENT_UPLOAD_NOT_ALLOWED',
        message:
          'O estado atual da verificacao nao permite novos documentos.',
      });
    }

    if (
      professional.verificationStatus ===
        VerificationStatus.PENDING &&
      professional.verificationSubmittedAt !== null
    ) {
      throw new ConflictException({
        code: 'VERIFICATION_ALREADY_SUBMITTED',
        message:
          'A verificacao ja foi enviada e esta aguardando analise.',
      });
    }

    const validated = validateVerificationFile(file);

    const storagePath =
      `professionals/${professional.id}/verification/` +
      `${randomUUID()}${validated.extension}`;

    await this.storage.uploadPrivate({
      path: storagePath,
      data: file.buffer,
      contentType: validated.mimeType,
    });

    try {
      const document = await this.prisma.verificationDocument.create({
        data: {
          professionalId: professional.id,
          originalName: validated.originalName,
          storagePath,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
        },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      });
      await this.audit.record({
        actorId: userId,
        action: 'VERIFICATION_DOCUMENT_UPLOADED',
        entityType: 'VERIFICATION_DOCUMENT',
        entityId: document.id,
        details: { originalName: document.originalName, sizeBytes: document.sizeBytes },
      });
      return document;
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async listMyDocuments(userId: string) {
    const professional =
      await this.prisma.professional.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
        },
      });

    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Perfil profissional não encontrado.',
      });
    }

    return this.prisma.verificationDocument.findMany({
      where: {
        professionalId: professional.id,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async submit(userId: string) {
    const professional =
      await this.prisma.professional.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
          crm: true,
          crmState: true,
          specialtyId: true,
          verificationStatus: true,
          verificationSubmittedAt: true,
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
            },
          },
          _count: {
            select: {
              verificationDocuments: true,
            },
          },
        },
      });

    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Perfil profissional não encontrado.',
      });
    }

    // No LifeHub só médicos são aceitos: CRM, UF e especialidade são obrigatórios.
    const profileComplete =
      Boolean(professional.crm?.trim()) &&
      Boolean(professional.crmState?.trim()) &&
      Boolean(professional.specialtyId) &&
      Boolean(professional.user.name.trim()) &&
      Boolean(professional.user.email.trim()) &&
      Boolean(professional.user.phone.trim()) &&
      professional._count.verificationDocuments > 0;

    if (!profileComplete) {
      throw new BadRequestException({
        code: 'INCOMPLETE_VERIFICATION_PROFILE',
        message:
          'Informe CRM, UF e especialidade e envie ao menos um documento antes da verificação.',
      });
    }

    if (
      professional.verificationStatus ===
        VerificationStatus.PENDING &&
      professional.verificationSubmittedAt !== null
    ) {
      throw new ConflictException({
        code: 'VERIFICATION_ALREADY_SUBMITTED',
        message:
          'A verificacao ja foi enviada e esta aguardando analise.',
      });
    }

    const canSubmit =
      professional.verificationStatus ===
        VerificationStatus.PENDING ||
      professional.verificationStatus ===
        VerificationStatus.CHANGES_REQUESTED;

    if (!canSubmit) {
      throw new ConflictException({
        code: 'VERIFICATION_SUBMISSION_NOT_ALLOWED',
        message:
          'O estado atual da verificacao nao permite novo envio.',
      });
    }

    const submitted = await this.prisma.professional.update({
      where: {
        id: professional.id,
      },
      data: {
        verificationStatus: VerificationStatus.PENDING,
        verificationSubmittedAt: new Date(),
      },
      select: {
        id: true,
        verificationStatus: true,
        verificationSubmittedAt: true,
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'VERIFICATION_SUBMITTED',
      entityType: 'PROFESSIONAL',
      entityId: professional.id,
    });
    return submitted;
  }
}
