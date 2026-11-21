import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VerificationStatus } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service';
import {
  validateVerificationFile,
  type VerificationUploadFile,
} from '../verification/verification-file.validator';
import { CreateClinicDto } from './create-clinic.dto';
import { UpdateClinicDto } from './update-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly professionalsService: ProfessionalsService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /**
   * Quem pode mexer nos dados e documentos do local: o responsável técnico
   * ou, se ainda não houver, o único médico vinculado.
   */
  private async assertCanManage(clinic: { id: string; technicalResponsibleProfessionalId: string | null }, userId: string) {
    const me = await this.professionalsService.findMine(userId);
    if (clinic.technicalResponsibleProfessionalId) {
      if (clinic.technicalResponsibleProfessionalId !== me.id) {
        throw new ForbiddenException({
          code: 'CLINIC_EDIT_ONLY_RESPONSIBLE',
          message: 'Só o responsável técnico pode editar os dados deste local.',
        });
      }
    } else {
      const linked = await this.prisma.clinicProfessional.count({ where: { clinicId: clinic.id } });
      if (linked > 1) {
        throw new ForbiddenException({
          code: 'CLINIC_EDIT_ONLY_RESPONSIBLE',
          message: 'Este local é compartilhado e ainda não tem responsável técnico. Peça à administração.',
        });
      }
    }
    return me;
  }

  /** Documentos do local (só os dados, nunca o caminho do arquivo). */
  async listDocuments(clinicId: string, userId: string) {
    await this.findMineById(clinicId, userId);
    return this.prisma.clinicDocument.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    });
  }

  /** Alvará ou comprovante do local, guardado criptografado. */
  async uploadDocument(clinicId: string, userId: string, file: VerificationUploadFile) {
    const clinic = await this.findMineById(clinicId, userId);
    const me = await this.assertCanManage(clinic, userId);
    const validated = validateVerificationFile(file);
    const storagePath = `clinics/${clinic.id}/documents/${randomUUID()}${validated.extension}`;

    await this.storage.uploadPrivate({ path: storagePath, data: file.buffer, contentType: validated.mimeType });
    try {
      const document = await this.prisma.clinicDocument.create({
        data: {
          clinicId: clinic.id,
          uploadedById: me.id,
          originalName: validated.originalName,
          storagePath,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
        },
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
      });
      await this.audit.record({
        actorId: userId,
        action: 'CLINIC_DOCUMENT_UPLOADED',
        entityType: 'CLINIC',
        entityId: clinic.id,
        details: { clinicName: clinic.name, originalName: document.originalName, sizeBytes: document.sizeBytes },
      });
      return document;
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      throw error;
    }
  }

  private validateCoordinatePair(
    latitude?: number | null,
    longitude?: number | null,
  ) {
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException({
        code: 'INVALID_CLINIC_COORDINATES',
        message: 'Latitude e longitude devem ser informadas juntas.',
      });
    }
  }

  /**
   * Consulta de referência para snapshots do agendamento.
   * A clínica precisa permanecer aprovada no instante da reserva.
   */
  async validateClinicForBooking(clinicId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const clinic = await db.clinic.findFirst({
      where: {
        id: clinicId,
        verificationStatus: VerificationStatus.APPROVED,
      },
      select: {
        id: true,
        name: true,
        address: true,
      },
    });

    if (!clinic) {
      throw new NotFoundException({
        code: 'CLINIC_NOT_AVAILABLE',
        message: 'Clínica não encontrada ou não aprovada para agendamento.',
      });
    }

    return clinic;
  }

  async listPublic(page = 1, limit = 20) {
    return this.prisma.clinic.findMany({
      where: {
        verificationStatus: VerificationStatus.APPROVED,
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        neighborhood: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit + 1,
    });
  }

  async listMine(userId: string) {
    const professional = await this.professionalsService.findMine(userId);

    return this.prisma.clinic.findMany({
      where: {
        professionalLinks: {
          some: {
            professionalId: professional.id,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: { _count: { select: { documents: true } } },
    });
  }

  async findMineById(clinicId: string, userId: string) {
    const professional = await this.professionalsService.findMine(userId);

    const clinic = await this.prisma.clinic.findFirst({
      where: {
        id: clinicId,
        professionalLinks: {
          some: {
            professionalId: professional.id,
          },
        },
      },
    });

    if (!clinic) {
      throw new NotFoundException({
        code: 'CLINIC_NOT_FOUND',
        message: 'Clínica não encontrada.',
      });
    }

    return clinic;
  }

  /** Um CNES só pode pertencer a um local no LifeHub. */
  private async assertCnesAvailable(cnes: string, ignoreClinicId?: string) {
    const existing = await this.prisma.clinic.findFirst({
      where: { cnes, ...(ignoreClinicId && { id: { not: ignoreClinicId } }) },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CNES_ALREADY_REGISTERED',
        message:
          'Este CNES já está cadastrado no LifeHub. Se o local é o mesmo, peça ao responsável técnico para vincular você.',
      });
    }
  }

  async createMine(userId: string, dto: CreateClinicDto) {
    const professional = await this.professionalsService.findMine(userId);
    await this.assertCnesAvailable(dto.cnes);

    this.validateCoordinatePair(dto.latitude, dto.longitude);

    const created = await this.prisma.clinic.create({
      data: {
        cnes: dto.cnes,
        ...(dto.cep && { cep: dto.cep }),
        name: dto.name.trim(),
        address: dto.address.trim(),
        city: dto.city.trim(),
        neighborhood: dto.neighborhood.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        // Quem cadastra o local é o responsável técnico por ele.
        technicalResponsibleProfessionalId: professional.id,
        professionalLinks: {
          create: {
            professionalId: professional.id,
          },
        },
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'CLINIC_CREATED',
      entityType: 'CLINIC',
      entityId: created.id,
      details: { cnes: created.cnes, name: created.name, address: created.address, neighborhood: created.neighborhood, city: created.city },
    });
    return created;
  }

  async updateMine(clinicId: string, userId: string, dto: UpdateClinicDto) {
    const clinic = await this.findMineById(clinicId, userId);

    // Clínica dividida: só o responsável técnico muda os dados.
    await this.assertCanManage(clinic, userId);

    const finalLatitude =
      dto.latitude !== undefined ? dto.latitude : clinic.latitude;
    const finalLongitude =
      dto.longitude !== undefined ? dto.longitude : clinic.longitude;

    this.validateCoordinatePair(finalLatitude, finalLongitude);

    const responsibleWillChange =
      dto.technicalResponsibleProfessionalId !== undefined &&
      dto.technicalResponsibleProfessionalId !==
        clinic.technicalResponsibleProfessionalId;

    if (responsibleWillChange && dto.technicalResponsibleProfessionalId) {
      const linkedProfessional = await this.prisma.clinicProfessional.findFirst(
        {
          where: {
            clinicId,
            professionalId: dto.technicalResponsibleProfessionalId,
          },
          select: {
            id: true,
          },
        },
      );

      if (!linkedProfessional) {
        throw new BadRequestException({
          code: 'TECHNICAL_RESPONSIBLE_NOT_LINKED',
          message: 'O responsável técnico deve estar vinculado à clínica.',
        });
      }
    }

    if (dto.cnes !== undefined && dto.cnes !== clinic.cnes) {
      await this.assertCnesAvailable(dto.cnes, clinic.id);
    }

    // CNES, nome e endereço aprovados pelo admin não mudam sem nova análise.
    const tracked = ['cnes', 'cep', 'name', 'address', 'city', 'neighborhood'] as const;
    const changes: Record<string, { from: string | number | null; to: string | number | null }> = {};
    for (const key of tracked) {
      if (dto[key] !== undefined && dto[key]!.trim() !== clinic[key]) changes[key] = { from: clinic[key], to: dto[key]!.trim() };
    }
    const locationChanged = Object.keys(changes).length > 0;

    const updated = await this.prisma.clinic.update({
      where: {
        id: clinic.id,
      },
      data: {
        ...(dto.cnes !== undefined && {
          cnes: dto.cnes,
        }),
        ...(dto.cep !== undefined && {
          cep: dto.cep,
        }),
        ...(dto.name !== undefined && {
          name: dto.name.trim(),
        }),
        ...(dto.address !== undefined && {
          address: dto.address.trim(),
        }),
        ...(dto.city !== undefined && {
          city: dto.city.trim(),
        }),
        ...(dto.neighborhood !== undefined && {
          neighborhood: dto.neighborhood.trim(),
        }),
        ...(dto.latitude !== undefined && {
          latitude: dto.latitude,
        }),
        ...(dto.longitude !== undefined && {
          longitude: dto.longitude,
        }),
        ...(dto.technicalResponsibleProfessionalId !== undefined && {
          technicalResponsibleProfessionalId:
            dto.technicalResponsibleProfessionalId,
        }),
        ...((responsibleWillChange || locationChanged) && {
          verificationStatus: VerificationStatus.PENDING,
        }),
      },
    });
    if (Object.keys(changes).length > 0 || responsibleWillChange) {
      await this.audit.record({
        actorId: userId,
        action: 'CLINIC_UPDATED',
        entityType: 'CLINIC',
        entityId: clinic.id,
        details: { changes, backToReview: responsibleWillChange || locationChanged },
      });
    }
    return updated;
  }
}
