import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { SOURCE_FAILURES, SourceProbeService } from './source-probe.service';
import type { SourceProbeResult } from './source-probe.service';

export const SOURCE_RECHECK_MS = 24 * 60 * 60 * 1000;
export const SOURCE_CLAIM_MS = 120_000;
interface ClaimedSource { id: string; sourceUrl: string; version: string }

@Injectable()
export class SourceAvailabilityService {
  constructor(private readonly prisma: PrismaService, private readonly probe: SourceProbeService) {}

  async checkBatch(now: Date, batchSize: number) {
    if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) {
      throw new Error('INVALID_SOURCE_AVAILABILITY_BATCH');
    }
    const claimId = randomUUID();
    // Database time is authoritative for leases and the recheck cadence.
    // One atomic statement claims rows; no transaction or row lock is held during DNS/TLS.
    const rows = await this.prisma.$queryRaw<ClaimedSource[]>(Prisma.sql`
      WITH candidates AS (
        SELECT c.id FROM public.campaigns c
        WHERE c.status = 'PUBLISHED' AND c.ends_at >= ${now}
          AND c.source_status IN ('VALID', 'NOT_CHECKED')
          AND (c.source_checked_at IS NULL OR c.source_checked_at <= clock_timestamp() - ${SOURCE_RECHECK_MS} * interval '1 millisecond')
          AND (c.source_check_claim_until IS NULL OR c.source_check_claim_until <= clock_timestamp())
        ORDER BY c.source_checked_at ASC NULLS FIRST, c.id ASC
        LIMIT ${batchSize} FOR UPDATE OF c SKIP LOCKED
      )
      UPDATE public.campaigns c SET source_check_claim_id = ${claimId}::uuid,
        source_check_claim_until = clock_timestamp() + ${SOURCE_CLAIM_MS} * interval '1 millisecond'
      FROM candidates WHERE c.id = candidates.id
      RETURNING c.id, c.source_url AS "sourceUrl", c.xmin::text AS version
    `);
    let cursor = 0;
    let processedCount = 0;
    let failed = false;
    const worker = async () => {
      while (!failed && cursor < rows.length) {
        const row = rows[cursor++];
        try {
          const result: SourceProbeResult = await this.probe.check(row.sourceUrl);
          if (!result || (result.available !== true && (result.available !== false ||
              !SOURCE_FAILURES.includes(result.failure)))) throw new Error('INVALID_SOURCE_PROBE_RESULT');
          const failure = result.available ? null : result.failure;
          // xmin fences every concurrent row edit, even if URL/status is changed and restored.
          // A replaced/expired claim or an administrative edit cannot receive this old result.
          const updated = await this.prisma.$executeRaw(Prisma.sql`
            UPDATE public.campaigns SET
              source_status = CASE WHEN ${result.available} THEN source_status ELSE 'UNREACHABLE'::"SourceStatus" END,
              source_checked_at = clock_timestamp(), source_check_failure = ${failure},
              source_check_claim_id = NULL, source_check_claim_until = NULL, updated_at = clock_timestamp()
            WHERE id = ${row.id}::uuid AND source_check_claim_id = ${claimId}::uuid
              AND xmin::text = ${row.version} AND source_check_claim_until > clock_timestamp()
              AND status = 'PUBLISHED' AND ends_at >= clock_timestamp()
          `);
          processedCount += updated;
        } catch (error) { failed = true; throw error; }
      }
    };
    try {
      const results = await Promise.allSettled(Array.from({ length: Math.min(3, rows.length) }, worker));
      const error = results.find((result) => result.status === 'rejected');
      if (error?.status === 'rejected') throw error.reason;
    } finally {
      // Release only this invocation's unfinished claims. Crashes recover by the lease deadline.
      if (rows.length > 0) await this.prisma.$executeRaw(Prisma.sql`
        UPDATE public.campaigns SET source_check_claim_id = NULL, source_check_claim_until = NULL
        WHERE source_check_claim_id = ${claimId}::uuid
      `);
    }
    const remaining = await this.prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (SELECT 1 FROM public.campaigns
        WHERE status = 'PUBLISHED' AND ends_at >= ${now}
          AND source_status IN ('VALID', 'NOT_CHECKED')
          AND (source_checked_at IS NULL OR source_checked_at <= clock_timestamp() - ${SOURCE_RECHECK_MS} * interval '1 millisecond')) AS exists
    `);
    return { processedCount, hasMore: remaining[0]?.exists === true };
  }
}
