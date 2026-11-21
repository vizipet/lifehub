import { CampaignExpirationService } from '../campaigns/campaign-expiration.service';
import { CampaignExpirationJob } from './campaign-expiration.job';

describe('CampaignExpirationJob', () => {
  it.each([true, false])('preserva contexto e informa trabalho restante=%s', async (hasMore) => {
    const endExpiredBatch = jest.fn().mockResolvedValue({ processedCount: 1, hasMore });
    const job = new CampaignExpirationJob({ endExpiredBatch } as unknown as CampaignExpirationService);
    const context = { runId: 'fixture', startedAt: new Date(), batchSize: 2 };
    expect(await job.execute(context)).toEqual({ processedCount: 1, status: hasMore ? 'partial' : 'completed' });
    expect(endExpiredBatch).toHaveBeenCalledWith(context.startedAt, 2);
    expect(endExpiredBatch).toHaveBeenCalledTimes(1);
  });
});
