import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ClinicsService } from '../clinics/clinics.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, UserStatus, VerificationStatus } from '../generated/prisma/client';
import type { BookingEligibilityInput, ServiceSnapshot } from './scheduling.contract';
import { CreateServiceDto } from './create-service.dto';
import { UpdateServiceDto } from './update-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicsService: ClinicsService,
    private readonly audit: AuditService,
  ) {}

  /** Id do médico logado (cada médico só mexe nos próprios serviços). */
  private async ownProfessionalId(userId: string): Promise<string> {
    const professional = await this.prisma.professional.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND',
        message: 'Perfil profissional não encontrado.',
      });
    }
    return professional.id;
  }

  private assertOnlySelf(professionalIds: string[], own: string) {
    if (professionalIds.length !== 1 || professionalIds[0] !== own) {
      throw new ForbiddenException({
        code: 'SERVICE_ONLY_OWN_PROFESSIONAL',
        message: 'Você só pode cadastrar serviços para você mesmo.',
      });
    }
  }

  private async assertProfessionalsLinked(
    clinicId: string,
    professionalIds: string[],
  ) {
    const links = await this.prisma.clinicProfessional.findMany({
      where: {
        clinicId,
        professionalId: {
          in: professionalIds,
        },
      },
      select: {
        professionalId: true,
      },
    });

    if (links.length !== professionalIds.length) {
      throw new BadRequestException({
        code: 'SERVICE_PROFESSIONAL_NOT_LINKED',
        message:
          'Todos os profissionais do serviço devem estar vinculados à clínica.',
      });
    }
  }

  async listPublic(clinicId: string) {
    return this.prisma.service.findMany({
      where: {
        clinicId,
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
        professionalLinks: {
          some: {
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
              clinicLinks: {
                some: {
                  clinicId,
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        modality: true,
        durationMinutes: true,
        priceCents: true,
        professionalLinks: {
          where: {
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
              clinicLinks: {
                some: {
                  clinicId,
                },
              },
            },
          },
          select: {
            professional: {
              select: {
                id: true,
                crm: true,
                crmState: true,
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async listMine(clinicId: string, userId: string) {
    await this.clinicsService.findMineById(clinicId, userId);
    const own = await this.ownProfessionalId(userId);

    return this.prisma.service.findMany({
      where: {
        clinicId,
        professionalLinks: { some: { professionalId: own } },
      },
      include: {
        professionalLinks: {
          include: {
            professional: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findMineById(clinicId: string, serviceId: string, userId: string) {
    await this.clinicsService.findMineById(clinicId, userId);
    const own = await this.ownProfessionalId(userId);

    // Serviço de outro médico da mesma clínica responde como inexistente.
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        clinicId,
        professionalLinks: { some: { professionalId: own } },
      },
      include: {
        professionalLinks: {
          include: {
            professional: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException({
        code: 'SERVICE_NOT_FOUND',
        message: 'Serviço não encontrado.',
      });
    }

    return service;
  }

  async createMine(clinicId: string, userId: string, dto: CreateServiceDto) {
    await this.clinicsService.findMineById(clinicId, userId);
    const own = await this.ownProfessionalId(userId);
    this.assertOnlySelf(dto.professionalIds, own);

    await this.assertProfessionalsLinked(clinicId, dto.professionalIds);

    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          clinicId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          modality: dto.modality,
          durationMinutes: dto.durationMinutes,
          priceCents: dto.priceCents ?? null,
          professionalLinks: {
            create: dto.professionalIds.map((professionalId) => ({
              professionalId,
            })),
          },
        },
        include: {
          professionalLinks: {
            include: {
              professional: true,
            },
          },
        },
      });
      await this.audit.record(
        {
          actorId: userId,
          action: 'SERVICE_CREATED',
          entityType: 'SERVICE',
          entityId: service.id,
          details: {
            clinicId,
            name: service.name,
            modality: service.modality,
            durationMinutes: service.durationMinutes,
            priceCents: service.priceCents,
          },
        },
        tx,
      );
      return service;
    });
  }

  /**
   * G2 / manual: valida o serviço isoladamente e entrega snapshot mínimo.
   * Para criar agendamento, chamar também validateBookingEligibility dentro
   * da mesma transação que reservará o horário.
   */
  async validateService(
    serviceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ServiceSnapshot> {
    const db = tx ?? this.prisma;
    const service = await db.service.findFirst({
      where: {
        id: serviceId,
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
      },
      select: {
        id: true,
        clinicId: true,
        name: true,
        durationMinutes: true,
        modality: true,
        priceCents: true,
      },
    });

    if (!service) {
      throw new ConflictException({
        code: 'SERVICE_NOT_AVAILABLE',
        message: 'Serviço inativo, inexistente ou clínica não aprovada.',
      });
    }

    return service;
  }

  /**
   * Verifica o conjunto serviço + clínica + profissional.
   * Deve receber o TransactionClient do agendamento; não reserva o slot.
   * A consulta mantém as regras no domínio de serviços, sem expor tabelas ao G2.
   */
  async validateBookingEligibility(
    input: BookingEligibilityInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ServiceSnapshot> {
    const db = tx ?? this.prisma;
    const service = await db.service.findFirst({
      where: {
        id: input.serviceId,
        clinicId: input.clinicId,
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
        professionalLinks: {
          some: {
            professionalId: input.professionalId,
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
              clinicLinks: {
                some: {
                  clinicId: input.clinicId,
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        clinicId: true,
        name: true,
        durationMinutes: true,
        modality: true,
        priceCents: true,
      },
    });

    if (!service) {
      throw new ConflictException({
        code: 'SERVICE_NOT_AVAILABLE',
        message:
          'Serviço, clínica ou médico indisponível.',
      });
    }

    return service;
  }

  async assertProfessionalCanOfferService(
    serviceId: string,
    professionalId: string,
    clinicId: string,
  ) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        clinicId,
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
        professionalLinks: {
          some: {
            professionalId,
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
              clinicLinks: {
                some: {
                  clinicId,
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        clinicId: true,
        durationMinutes: true,
        modality: true,
      },
    });

    if (!service) {
      throw new ConflictException({
        code: 'SERVICE_NOT_AVAILABLE',
        message:
          'Serviço, clínica ou profissional indisponível para este horário.',
      });
    }

    return service;
  }

  async assertAvailableForScheduling(
    serviceId: string,
    professionalId: string,
  ) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        isActive: true,
        clinic: {
          verificationStatus: VerificationStatus.APPROVED,
        },
        professionalLinks: {
          some: {
            professionalId,
            professional: {
              verificationStatus: VerificationStatus.APPROVED,
              user: {
                status: UserStatus.ACTIVE,
              },
            },
          },
        },
      },
      select: {
        id: true,
        clinicId: true,
        durationMinutes: true,
        modality: true,
      },
    });

    if (!service) {
      throw new ConflictException({
        code: 'SERVICE_NOT_AVAILABLE',
        message:
          'Serviço, clínica ou médico indisponível.',
      });
    }

    const clinicLink = await this.prisma.clinicProfessional.findFirst({
      where: {
        clinicId: service.clinicId,
        professionalId,
      },
      select: {
        id: true,
      },
    });

    if (!clinicLink) {
      throw new ConflictException({
        code: 'SERVICE_NOT_AVAILABLE',
        message:
          'Serviço, clínica ou médico indisponível.',
      });
    }

    return service;
  }

  async updateMine(
    clinicId: string,
    serviceId: string,
    userId: string,
    dto: UpdateServiceDto,
  ) {
    const service = await this.findMineById(clinicId, serviceId, userId);

    if (dto.professionalIds !== undefined) {
      this.assertOnlySelf(dto.professionalIds, await this.ownProfessionalId(userId));
      await this.assertProfessionalsLinked(clinicId, dto.professionalIds);
    }

    // O que mudou, campo a campo, para o histórico do admin.
    const next = {
      name: dto.name !== undefined ? dto.name.trim() : service.name,
      description: dto.description !== undefined ? dto.description.trim() || null : service.description,
      modality: dto.modality ?? service.modality,
      durationMinutes: dto.durationMinutes ?? service.durationMinutes,
      priceCents: dto.priceCents !== undefined ? dto.priceCents : service.priceCents,
      isActive: dto.isActive ?? service.isActive,
    };
    const changes: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (next[key] !== service[key]) changes[key] = { from: service[key], to: next[key] };
    }
    const onlyActivation = Object.keys(changes).length === 1 && 'isActive' in changes;
    const action = onlyActivation ? (next.isActive ? 'SERVICE_ACTIVATED' : 'SERVICE_DEACTIVATED') : 'SERVICE_UPDATED';

    return this.prisma.$transaction(async (tx) => {
    const updated = await tx.service.update({
      where: {
        id: service.id,
      },
      data: {
        ...(dto.name !== undefined && {
          name: dto.name.trim(),
        }),
        ...(dto.description !== undefined && {
          description: dto.description.trim() || null,
        }),
        ...(dto.modality !== undefined && {
          modality: dto.modality,
        }),
        ...(dto.durationMinutes !== undefined && {
          durationMinutes: dto.durationMinutes,
        }),
        ...(dto.priceCents !== undefined && {
          priceCents: dto.priceCents,
        }),
        ...(dto.isActive !== undefined && {
          isActive: dto.isActive,
        }),
        ...(dto.professionalIds !== undefined && {
          professionalLinks: {
            deleteMany: {},
            create: dto.professionalIds.map((professionalId) => ({
              professionalId,
            })),
          },
        }),
      },
      include: {
        professionalLinks: {
          include: {
            professional: true,
          },
        },
      },
    });
      if (Object.keys(changes).length > 0) {
        await this.audit.record(
          {
            actorId: userId,
            action,
            entityType: 'SERVICE',
            entityId: service.id,
            details: { clinicId, name: updated.name, changes },
          },
          tx,
        );
      }
      return updated;
    });
  }

  /**
   * Exclui de verdade só serviço que nunca foi usado. Se já teve horários
   * ou consultas, o histórico dos pacientes depende dele: o caminho é desativar.
   */
  async deleteMine(clinicId: string, serviceId: string, userId: string): Promise<void> {
    const service = await this.findMineById(clinicId, serviceId, userId);

    await this.prisma.$transaction(async (tx) => {
      const [slots, appointments] = await Promise.all([
        tx.availabilitySlot.count({ where: { serviceId: service.id } }),
        tx.appointment.count({ where: { serviceId: service.id } }),
      ]);
      if (slots > 0 || appointments > 0) {
        throw new ConflictException({
          code: 'SERVICE_IN_USE',
          message:
            'Este serviço já tem horários ou consultas e não pode ser excluído. Desative-o para que não apareça mais para os pacientes.',
        });
      }
      await tx.serviceProfessional.deleteMany({ where: { serviceId: service.id } });
      await tx.service.delete({ where: { id: service.id } });
      await this.audit.record(
        {
          actorId: userId,
          action: 'SERVICE_DELETED',
          entityType: 'SERVICE',
          entityId: service.id,
          details: {
            clinicId,
            name: service.name,
            modality: service.modality,
            durationMinutes: service.durationMinutes,
            priceCents: service.priceCents,
          },
        },
        tx,
      );
    });
  }
}
