import { OutboxJobService } from '../notifications/outbox-job.service';
import { OutboxProcessingJob } from './outbox-processing.job';

describe('OutboxProcessingJob', () => {
  it.each([true, false])('preserva lote e trabalho restante=%s', async (hasMore) => {
    const runBatch = jest.fn().mockResolvedValue({ processedCount: 1, hasMore });
    const job = new OutboxProcessingJob({ runBatch } as unknown as OutboxJobService);
    expect(await job.execute({ runId: 'fixture', startedAt: new Date(), batchSize: 2 }))
      .toEqual({ processedCount: 1, status: hasMore ? 'partial' : 'completed' });
    expect(runBatch).toHaveBeenCalledWith(2);
    expect(runBatch).toHaveBeenCalledTimes(1);
  });
});
