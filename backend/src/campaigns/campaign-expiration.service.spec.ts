import { PrismaService } from '../common/prisma/prisma.service';
import { CampaignStatus } from '../generated/prisma/client';
import { CampaignExpirationService } from './campaign-expiration.service';

describe('CampaignExpirationService', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');
  const query = jest.fn();
  const updateMany = jest.fn();
  const findFirst = jest.fn();
  const tx = { $queryRaw: query, campaign: { updateMany, findFirst } };
  const transaction = jest.fn();
  let service: CampaignExpirationService;

  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 0 });
    findFirst.mockResolvedValue(null);
    transaction.mockImplementation((work: (value: typeof tx) => Promise<unknown>) => work(tx));
    service = new CampaignExpirationService({ $transaction: transaction } as unknown as PrismaService);
  });

  it.each([0, -1, 1.5, 26, NaN, Infinity])('recusa tamanho de lote inválido antes da transação: %s', async (size) => {
    await expect(service.endExpiredBatch(now, size)).rejects.toThrow('INVALID_CAMPAIGN_EXPIRATION_BATCH');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('recusa horário inválido antes da transação', async () => {
    await expect(service.endExpiredBatch(new Date(NaN), 1)).rejects.toThrow('INVALID_CAMPAIGN_EXPIRATION_BATCH');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('não altera registros quando não há candidatos', async () => {
    expect(await service.endExpiredBatch(now, 10)).toEqual({ processedCount: 0, hasMore: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('preserva o filtro de estado/data e altera somente o status dos candidatos', async () => {
    query.mockResolvedValue([{ id: 'campaign-id' }]);
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'another-id' });
    expect(await service.endExpiredBatch(now, 1)).toEqual({ processedCount: 1, hasMore: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['campaign-id'] }, status: CampaignStatus.PUBLISHED, endsAt: { lt: now } },
      data: { status: CampaignStatus.ENDED },
    });
  });

  it('sinaliza trabalho restante mesmo quando outra transação está com a linha', async () => {
    findFirst.mockResolvedValue({ id: 'locked-id' });
    expect(await service.endExpiredBatch(now, 1)).toEqual({ processedCount: 0, hasMore: true });
  });

  it('propaga falha ao alterar um lote sem relatar sucesso', async () => {
    query.mockResolvedValue([{ id: 'campaign-id' }]);
    updateMany.mockRejectedValue(new Error('database-failure'));
    await expect(service.endExpiredBatch(now, 1)).rejects.toThrow('database-failure');
    expect(findFirst).not.toHaveBeenCalled();
  });
});
