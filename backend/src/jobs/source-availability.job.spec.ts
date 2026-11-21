import { SourceAvailabilityService } from '../campaigns/source-availability.service';
import { SourceAvailabilityJob } from './source-availability.job';

describe('SourceAvailabilityJob', () => {
  it.each([true, false])('preserva contexto e trabalho restante=%s', async (hasMore) => {
    const checkBatch = jest.fn().mockResolvedValue({ processedCount: 1, hasMore });
    const job = new SourceAvailabilityJob({ checkBatch } as unknown as SourceAvailabilityService);
    const context = { runId: 'fixture', startedAt: new Date(), batchSize: 2 };
    expect(await job.execute(context)).toEqual({ processedCount: 1, status: hasMore ? 'partial' : 'completed' });
    expect(checkBatch).toHaveBeenCalledWith(context.startedAt, 2);
    expect(checkBatch).toHaveBeenCalledTimes(1);
  });
});
