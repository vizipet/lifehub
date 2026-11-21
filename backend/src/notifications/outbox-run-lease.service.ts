import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

export const OUTBOX_RUN_NAME = 'outbox-processing';
export const OUTBOX_RUN_LEASE_MS = 120_000;

@Injectable()
export class OutboxRunLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async acquire(ownerId: string): Promise<boolean> {
    // INSERT/conditional UPSERT is atomic across API instances. Only database time is used.
    const rows = await this.prisma.$queryRaw<Array<{ ownerId: string }>>(Prisma.sql`
      INSERT INTO public.internal_job_leases (name, owner_id, expires_at)
      VALUES (${OUTBOX_RUN_NAME}, ${ownerId}::uuid, clock_timestamp() + ${OUTBOX_RUN_LEASE_MS} * interval '1 millisecond')
      ON CONFLICT (name) DO UPDATE SET owner_id = EXCLUDED.owner_id,
        expires_at = clock_timestamp() + ${OUTBOX_RUN_LEASE_MS} * interval '1 millisecond'
      WHERE internal_job_leases.expires_at IS NULL OR internal_job_leases.expires_at <= clock_timestamp()
      RETURNING owner_id::text AS "ownerId"
    `);
    return rows.length === 1 && rows[0].ownerId === ownerId;
  }

  async renew(ownerId: string): Promise<boolean> {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE public.internal_job_leases
      SET expires_at = clock_timestamp() + ${OUTBOX_RUN_LEASE_MS} * interval '1 millisecond'
      WHERE name = ${OUTBOX_RUN_NAME} AND owner_id = ${ownerId}::uuid AND expires_at > clock_timestamp()
    `);
    return count === 1;
  }

  async release(ownerId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE public.internal_job_leases SET owner_id = NULL, expires_at = NULL
      WHERE name = ${OUTBOX_RUN_NAME} AND owner_id = ${ownerId}::uuid
    `);
  }
}
