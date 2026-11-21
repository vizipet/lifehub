import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CampaignStatus, Prisma, SourceStatus, UserRole, UserStatus } from '../generated/prisma/client';
import type { Campaign } from '../generated/prisma/client';
import { CreateCampaignDto } from './create-campaign.dto';
import { ListAdminCampaignsQueryDto, ReviewCampaignSourceDto } from './review-campaign-source.dto';
import { parseSourceUrl } from './source-url.policy';
import { UpdateCampaignDto } from './update-campaign.dto';

type AdminCampaign = Omit<Campaign, 'sourceCheckClaimId' | 'sourceCheckClaimUntil'> & { version: string };
type Change = { data: Prisma.CampaignUncheckedUpdateInput; reason?: string; details?: Prisma.InputJsonObject };
const fields = ['title', 'type', 'agency', 'targetAudience', 'requirements', 'location', 'sourceUrl'] as const;
const adminColumns = Prisma.sql`
  c.id, c.title, c.type, c.agency, c.target_audience AS "targetAudience", c.requirements, c.location,
  c.starts_at AS "startsAt", c.ends_at AS "endsAt", c.source_url AS "sourceUrl",
  c.source_status AS "sourceStatus", c.source_checked_at AS "sourceCheckedAt",
  c.source_check_failure AS "sourceCheckFailure", c.status, c.verified_by_id AS "verifiedById",
  c.verified_at AS "verifiedAt", c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.xmin::text AS version
`;

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private invalid(message: string): never {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message });
  }

  private async assertAdmin(actorId: string, tx: Prisma.TransactionClient) {
    // Shared lock prevents a role/status change from racing an administrative write.
    const [actor] = await tx.$queryRaw<Array<{ role: UserRole; status: UserStatus }>>(Prisma.sql`
      SELECT role, status FROM public.users WHERE id = ${actorId}::uuid FOR SHARE
    `);
    if (!actor || actor.role !== UserRole.ADMIN || actor.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({ code: 'ACTIVE_ADMIN_REQUIRED', message: 'Conta administrativa ativa necessária.' });
    }
  }

  private rows(tx: Prisma.TransactionClient, where: Prisma.Sql, lock = false) {
    return tx.$queryRaw<AdminCampaign[]>(Prisma.sql`
      SELECT ${adminColumns} FROM public.campaigns c WHERE ${where}
      ORDER BY c.created_at DESC, c.id DESC ${lock ? Prisma.sql`FOR UPDATE OF c` : Prisma.empty}
    `);
  }

  private async one(tx: Prisma.TransactionClient, id: string, lock = false) {
    const [row] = await this.rows(tx, Prisma.sql`c.id = ${id}::uuid`, lock);
    if (!row) throw new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND', message: 'Campanha não encontrada.' });
    return row;
  }

  private complete(input: Pick<Campaign, typeof fields[number] | 'startsAt' | 'endsAt'>) {
    if (fields.some((field) => typeof input[field] !== 'string' || input[field].trim().length === 0)) {
      this.invalid('Todos os campos obrigatórios da campanha devem estar preenchidos.');
    }
    if (!Number.isFinite(input.startsAt.getTime()) || !Number.isFinite(input.endsAt.getTime()) || input.startsAt >= input.endsAt) {
      this.invalid('O período da campanha é inválido.');
    }
    if (!parseSourceUrl(input.sourceUrl)) this.invalid('A fonte deve utilizar HTTPS público, sem credenciais ou endereço interno.');
  }

  private async change(id: string, actorId: string, action: string, decide: (row: AdminCampaign) => Change) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdmin(actorId, tx);
      const before = await this.one(tx, id, true);
      const decision = decide(before);
      const after = await tx.campaign.update({ where: { id }, data: {
        ...decision.data, sourceCheckClaimId: null, sourceCheckClaimUntil: null,
      } });
      await this.audit.record({ actorId, action, entityType: 'Campaign', entityId: id, reason: decision.reason,
        details: { fromStatus: before.status, toStatus: after.status, ...decision.details } }, tx);
      return this.one(tx, id);
    });
  }

  async create(dto: CreateCampaignDto, actorId: string) {
    const data = {
      ...Object.fromEntries(fields.map((field) => [field, typeof dto[field] === 'string' ? dto[field].trim() : dto[field]])),
      startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt),
    } as Pick<Campaign, typeof fields[number] | 'startsAt' | 'endsAt'>;
    this.complete(data);
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdmin(actorId, tx);
      const duplicate = await tx.campaign.findFirst({ where: {
        title: { equals: data.title, mode: 'insensitive' }, agency: { equals: data.agency, mode: 'insensitive' },
        startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt },
      }, select: { id: true } });
      const row = await tx.campaign.create({ data });
      await this.audit.record({ actorId, action: 'CAMPAIGN_CREATED', entityType: 'Campaign', entityId: row.id,
        details: { status: row.status } }, tx);
      return { campaign: await this.one(tx, row.id), possibleDuplicate: duplicate !== null };
    });
  }

  async endExpiredCampaigns() {
    return this.prisma.campaign.updateMany({ where: { status: CampaignStatus.PUBLISHED, endsAt: { lt: new Date() } },
      data: { status: CampaignStatus.ENDED } });
  }

  async findAllPublic() {
    await this.endExpiredCampaigns();
    const now = new Date();
    const rows = await this.prisma.campaign.findMany({ where: {
      status: CampaignStatus.PUBLISHED, startsAt: { lte: now }, endsAt: { gte: now },
      verifiedById: { not: null }, verifiedAt: { not: null }, sourceStatus: { not: SourceStatus.OUTDATED },
    }, select: {
      id: true, title: true, type: true, agency: true, targetAudience: true, requirements: true,
      location: true, startsAt: true, endsAt: true, sourceUrl: true, status: true, verifiedAt: true,
    }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] });
    // Revalida fontes legadas antes de expor um link público. Nenhuma requisição de rede.
    return rows.filter((row) => parseSourceUrl(row.sourceUrl) !== null);
  }

  async findAllAdmin(actorId: string, query: ListAdminCampaignsQueryDto = {}) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdmin(actorId, tx);
      return this.rows(tx, query.sourceStatus ? Prisma.sql`c.source_status = ${query.sourceStatus}::"SourceStatus"` : Prisma.sql`TRUE`);
    });
  }

  async findOneAdmin(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdmin(actorId, tx);
      return this.one(tx, id);
    });
  }

  updateAdmin(id: string, dto: UpdateCampaignDto, actorId: string) {
    return this.change(id, actorId, 'CAMPAIGN_UPDATED', (row) => {
      if (row.status === CampaignStatus.ARCHIVED) throw new ConflictException({ code: 'CAMPAIGN_ARCHIVED' });
      const data: Partial<Pick<Campaign, typeof fields[number] | 'startsAt' | 'endsAt'>> = {};
      for (const field of fields) {
        if (dto[field] !== undefined) {
          if (typeof dto[field] !== 'string') this.invalid('Campos obrigatórios não aceitam null.');
          data[field] = dto[field].trim();
        }
      }
      if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
      if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
      if (Object.keys(data).length === 0) this.invalid('Informe ao menos um campo para atualizar.');
      this.complete({ ...row, ...data });
      return { data: {
        ...data, status: CampaignStatus.DRAFT, verifiedById: null, verifiedAt: null,
        ...(data.sourceUrl !== undefined && data.sourceUrl !== row.sourceUrl ? {
          sourceStatus: SourceStatus.NOT_CHECKED, sourceCheckedAt: null, sourceCheckFailure: null,
        } : {}),
      }, details: { requiresReview: true } };
    });
  }

  archiveAdmin(id: string, actorId: string) {
    return this.change(id, actorId, 'CAMPAIGN_ARCHIVED', () => ({ data: { status: CampaignStatus.ARCHIVED } }));
  }

  submitForReviewAdmin(id: string, actorId: string) {
    return this.change(id, actorId, 'CAMPAIGN_SUBMITTED', (row) => {
      if (row.status !== CampaignStatus.DRAFT) this.invalid('Somente campanhas em rascunho podem ser enviadas para revisão.');
      this.complete(row);
      return { data: { status: CampaignStatus.UNDER_REVIEW } };
    });
  }

  publishAdmin(id: string, actorId: string) {
    return this.change(id, actorId, 'CAMPAIGN_PUBLISHED', (row) => {
      if (row.status !== CampaignStatus.UNDER_REVIEW) this.invalid('Somente campanhas em revisão podem ser publicadas.');
      this.complete(row);
      if (row.endsAt < new Date()) this.invalid('Campanha vencida não pode ser publicada.');
      if ([SourceStatus.UNREACHABLE, SourceStatus.OUTDATED].some((status) => status === row.sourceStatus)) {
        this.invalid('A fonte sinalizada exige revisão explícita antes da publicação.');
      }
      return { data: { status: CampaignStatus.PUBLISHED, verifiedById: actorId, verifiedAt: new Date(),
        sourceStatus: SourceStatus.VALID, sourceCheckFailure: null } };
    });
  }

  reviewSource(id: string, dto: ReviewCampaignSourceDto, actorId: string) {
    return this.change(id, actorId, 'CAMPAIGN_SOURCE_REVIEWED', (row) => {
      if (dto.expectedVersion !== row.version) {
        throw new ConflictException({ code: 'CAMPAIGN_VERSION_CHANGED', message: 'Consulte a campanha novamente antes de decidir.' });
      }
      if (row.status === CampaignStatus.ARCHIVED) throw new ConflictException({ code: 'CAMPAIGN_ARCHIVED' });
      if (![SourceStatus.VALID, SourceStatus.OUTDATED].some((status) => status === dto.sourceStatus) ||
          typeof dto.reason !== 'string' || !dto.reason.trim() || dto.reason.trim().length > 1000) {
        this.invalid('Informe uma decisão válida e a justificativa da revisão.');
      }
      this.complete(row);
      return { data: {
        sourceStatus: dto.sourceStatus, sourceCheckFailure: null,
        ...(dto.sourceStatus === SourceStatus.VALID ? { verifiedById: actorId, verifiedAt: new Date() } : {
          status: row.status === CampaignStatus.PUBLISHED ? CampaignStatus.UNDER_REVIEW : row.status,
          verifiedById: null, verifiedAt: null,
        }),
      }, reason: dto.reason.trim(), details: {
        fromSourceStatus: row.sourceStatus, toSourceStatus: dto.sourceStatus, expectedVersion: dto.expectedVersion,
      } };
    });
  }
}
