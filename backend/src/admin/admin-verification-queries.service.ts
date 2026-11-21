import { professionalPhotoUrl } from '../professionals/professional-photo';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole, UserStatus, VerificationStatus } from '../generated/prisma/client';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';

// Limite técnico interno do deslocamento; não é quantidade máxima de solicitações.
const MAX_PAGINATION_OFFSET = 2_147_483_647;

@Injectable()
export class AdminVerificationQueriesService {
  constructor(protected readonly prisma: PrismaService) {}

  protected async assertActiveAdmin(actorId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId }, select: { role: true, status: true },
    });
    if (!actor || actor.role !== UserRole.ADMIN || actor.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: 'ACTIVE_ADMIN_REQUIRED', message: 'O acesso exige uma conta administrativa ativa.',
      });
    }
  }

  private offset(query: ListVerificationsQueryDto) {
    const skip = (query.page - 1) * query.limit;
    if (!Number.isSafeInteger(skip) || skip < 0 || skip > MAX_PAGINATION_OFFSET) {
      throw new BadRequestException({
        code: 'PAGINATION_OFFSET_EXCEEDED',
        message: 'A página solicitada excede o limite técnico de paginação.',
      });
    }
    return skip;
  }

  private pagination(query: ListVerificationsQueryDto, total: number) {
    return { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async listPendingProfessionals(actorId: string, query: ListVerificationsQueryDto) {
    await this.assertActiveAdmin(actorId);
    const skip = this.offset(query);
    const where = {
      verificationStatus: VerificationStatus.PENDING,
      verificationSubmittedAt: { not: null },
      user: { status: UserStatus.ACTIVE },
    };
    const [data, total] = await Promise.all([
      this.prisma.professional.findMany({
        where,
        select: {
          id: true, crm: true, crmState: true, specialty: { select: { name: true } },
          verificationStatus: true, verificationSubmittedAt: true,
          photoUrl: true, photoStoragePath: true, photoUpdatedAt: true,
          user: { select: { id: true, name: true } },
        },
        orderBy: [{ verificationSubmittedAt: 'asc' }, { id: 'asc' }],
        skip, take: query.limit,
      }),
      this.prisma.professional.count({ where }),
    ]);
    // O admin vê a foto que o médico escolheu junto com os documentos.
    const rows = data.map(({ photoStoragePath, photoUpdatedAt, photoUrl, ...item }) => ({
      ...item,
      photoUrl: professionalPhotoUrl({ id: item.id, photoUrl, photoStoragePath, photoUpdatedAt }),
    }));
    return { data: rows, meta: this.pagination(query, total) };
  }

  async listProfessionalDocuments(actorId: string, professionalId: string, query: ListVerificationsQueryDto) {
    await this.assertActiveAdmin(actorId);
    const skip = this.offset(query);
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId }, select: { id: true },
    });
    if (!professional) {
      throw new NotFoundException({
        code: 'PROFESSIONAL_PROFILE_NOT_FOUND', message: 'Perfil profissional não encontrado.',
      });
    }
    const where = { professionalId };
    const [data, total] = await Promise.all([
      this.prisma.verificationDocument.findMany({
        where,
        select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip, take: query.limit,
      }),
      this.prisma.verificationDocument.count({ where }),
    ]);
    return { data, meta: this.pagination(query, total) };
  }
}
