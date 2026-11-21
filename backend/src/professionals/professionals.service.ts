import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus, VerificationStatus } from '../generated/prisma/client';
import type { ProfessionalSnapshot } from '../services/scheduling.contract';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProfessionalDto } from './create-professional.dto';
import { UpdateProfessionalDto } from './update-professional.dto';
import { professionalPhotoUrl } from './professional-photo';

const PROFILE_INCLUDE = {
  specialty: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertSpecialty(specialtyId: string) {
    const specialty = await this.prisma.specialty.findFirst({
      where: { id: specialtyId, isActive: true },
      select: { id: true },
    });
    if (!specialty) {
      throw new BadRequestException({
        code: 'SPECIALTY_NOT_FOUND',
        message: 'Especialidade não encontrada ou inativa.',
      });
    }
  }

  private async assertCrmAvailable(crm: string, crmState: string, ignoreId?: string) {
    const existing = await this.prisma.professional.findFirst({
      where: { crm, crmState, ...(ignoreId && { id: { not: ignoreId } }) },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CRM_ALREADY_REGISTERED',
        message: 'Este CRM já está cadastrado.',
      });
    }
  }

  /**
   * Usado pelo agendamento. Não autoriza participação numa clínica específica:
   * esse vínculo é checado por validateBookingEligibility.
   */
  async validateProfessional(
    professionalId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProfessionalSnapshot> {
    const db = tx ?? this.prisma;
    const professional = await db.professional.findFirst({
      where: {
        id: professionalId,
        verificationStatus: VerificationStatus.APPROVED,
        user: { status: UserStatus.ACTIVE },
      },
      select: {
        id: true,
        crm: true,
        crmState: true,
        specialty: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    if (!professional) {
      throw new ConflictException({
        code: 'PROFESSIONAL_NOT_AVAILABLE',
        message: 'Médico inexistente, inativo ou não aprovado.',
      });
    }

    return {
      id: professional.id,
      name: professional.user.name,
      crm: professional.crm,
      crmState: professional.crmState,
      specialty: professional.specialty?.name ?? null,
    };
  }

  async findMine(userId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      include: PROFILE_INCLUDE,
    });

    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Perfil profissional não encontrado.',
      });
    }

    return professional;
  }

  /** Perfil público de um médico aprovado, com locais e serviços ativos. */
  async findPublic(professionalId: string) {
    const professional = await this.prisma.professional.findFirst({
      where: {
        id: professionalId,
        verificationStatus: VerificationStatus.APPROVED,
        user: { status: UserStatus.ACTIVE },
      },
      select: {
        id: true,
        crm: true,
        crmState: true,
        bio: true,
        photoUrl: true,
        photoStoragePath: true,
        photoUpdatedAt: true,
        specialty: { select: { id: true, name: true } },
        user: { select: { name: true } },
        clinicLinks: {
          where: { clinic: { verificationStatus: VerificationStatus.APPROVED } },
          select: {
            clinic: {
              select: { id: true, name: true, address: true, neighborhood: true, city: true, latitude: true, longitude: true },
            },
          },
        },
        serviceLinks: {
          where: {
            service: {
              isActive: true,
              clinic: { verificationStatus: VerificationStatus.APPROVED },
            },
          },
          select: {
            service: {
              select: {
                id: true,
                clinicId: true,
                name: true,
                description: true,
                modality: true,
                durationMinutes: true,
                priceCents: true,
              },
            },
          },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_NOT_FOUND',
        message: 'Médico não encontrado.',
      });
    }

    return {
      id: professional.id,
      name: professional.user.name,
      crm: professional.crm,
      crmState: professional.crmState,
      bio: professional.bio,
      photoUrl: professionalPhotoUrl(professional),
      specialty: professional.specialty,
      clinics: professional.clinicLinks.map((link) => link.clinic),
      services: professional.serviceLinks.map((link) => link.service),
    };
  }

  async createMine(userId: string, dto: CreateProfessionalDto) {
    const existingProfile = await this.prisma.professional.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existingProfile) {
      throw new ConflictException({
        code: 'PROFESSIONAL_PROFILE_ALREADY_EXISTS',
        message: 'Este usuário já possui perfil profissional.',
      });
    }

    await this.assertSpecialty(dto.specialtyId);
    await this.assertCrmAvailable(dto.crm, dto.crmState);

    try {
      const created = await this.prisma.professional.create({
        data: {
          userId,
          crm: dto.crm,
          crmState: dto.crmState,
          specialtyId: dto.specialtyId,
          bio: dto.bio || null,
        },
        include: PROFILE_INCLUDE,
      });
      await this.audit.record({
        actorId: userId,
        action: 'PROFESSIONAL_PROFILE_CREATED',
        entityType: 'PROFESSIONAL',
        entityId: created.id,
        details: { crm: dto.crm, crmState: dto.crmState, specialty: created.specialty?.name ?? null },
      });
      return created;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'CRM_ALREADY_REGISTERED',
          message: 'Este CRM já está cadastrado.',
        });
      }
      throw error;
    }
  }

  async updateMine(userId: string, dto: UpdateProfessionalDto) {
    const professional = await this.findMine(userId);

    const crm = dto.crm ?? professional.crm;
    const crmState = dto.crmState ?? professional.crmState;
    const crmChanged = crm !== professional.crm || crmState !== professional.crmState;

    if (crmChanged && crm && crmState) {
      await this.assertCrmAvailable(crm, crmState, professional.id);
    }
    if (dto.specialtyId !== undefined) {
      await this.assertSpecialty(dto.specialtyId);
    }

    const changes: Record<string, { from: string | null; to: string | null }> = {};
    if (dto.crm !== undefined && dto.crm !== professional.crm) changes.crm = { from: professional.crm, to: dto.crm };
    if (dto.crmState !== undefined && dto.crmState !== professional.crmState) changes.crmState = { from: professional.crmState, to: dto.crmState };
    if (dto.specialtyId !== undefined && dto.specialtyId !== professional.specialtyId) changes.specialtyId = { from: professional.specialtyId, to: dto.specialtyId };
    if (dto.bio !== undefined && (dto.bio || null) !== professional.bio) changes.bio = { from: professional.bio, to: dto.bio || null };

    const updated = await this.prisma.professional.update({
      where: { id: professional.id },
      data: {
        ...(dto.crm !== undefined && { crm: dto.crm }),
        ...(dto.crmState !== undefined && { crmState: dto.crmState }),
        ...(dto.specialtyId !== undefined && { specialtyId: dto.specialtyId }),
        ...(dto.bio !== undefined && { bio: dto.bio || null }),
        // Trocar o CRM exige nova verificação pelo administrador.
        ...(crmChanged && {
          verificationStatus: VerificationStatus.PENDING,
          verificationSubmittedAt: null,
        }),
      },
      include: PROFILE_INCLUDE,
    });
    if (Object.keys(changes).length > 0) {
      await this.audit.record({
        actorId: userId,
        action: crmChanged ? 'PROFESSIONAL_CRM_CHANGED' : 'PROFESSIONAL_PROFILE_UPDATED',
        entityType: 'PROFESSIONAL',
        entityId: professional.id,
        details: { changes, specialty: updated.specialty?.name ?? null },
      });
    }
    return updated;
  }
}
