import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export interface CreateAuditRecord {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  details?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: CreateAuditRecord, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason ?? null,
        details: input.details ?? {},
      },
      select: { id: true, createdAt: true },
    });
  }
}
