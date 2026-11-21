import { PrismaService } from '../common/prisma/prisma.service';
import { OutboxJobService } from './outbox-job.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxRunLeaseService } from './outbox-run-lease.service';
import type { OutboxRunGuard } from './outbox-run-guard';

describe('OutboxJobService', () => {
  const acquire = jest.fn();
  const renew = jest.fn();
  const release = jest.fn();
  const processBatch = jest.fn();
  const findFirst = jest.fn();
  let service: OutboxJobService;
  beforeEach(() => {
    jest.resetAllMocks();
    acquire.mockResolvedValue(true);
    renew.mockResolvedValue(true);
    release.mockResolvedValue(undefined);
    processBatch.mockImplementation(async (_limit: number, guard: OutboxRunGuard) => {
      await guard();
      return { claimed: 1, processed: 1 };
    });
    findFirst.mockResolvedValue(null);
    service = new OutboxJobService({ outboxEvent: { findFirst } } as unknown as PrismaService,
      { processBatch } as unknown as OutboxProcessorService,
      { acquire, renew, release } as unknown as OutboxRunLeaseService);
  });
  it.each([0, -1, 1.5, 26, NaN, Infinity])('recusa lote inválido antes da reserva: %s', async (value) => {
    await expect(service.runBatch(value)).rejects.toThrow('INVALID_OUTBOX_JOB_BATCH');
    expect(acquire).not.toHaveBeenCalled();
    expect(processBatch).not.toHaveBeenCalled();
  });
  it('reserva ocupada devolve partial sem processar nem liberar outro dono', async () => {
    acquire.mockResolvedValue(false);
    expect(await service.runBatch(1)).toEqual({ processedCount: 0, hasMore: true });
    expect(processBatch).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(renew).not.toHaveBeenCalled();
  });
  it('renova e libera o mesmo identificador interno, com processamento limitado', async () => {
    expect(await service.runBatch(2)).toEqual({ processedCount: 1, hasMore: false });
    const owner: string = acquire.mock.calls[0][0];
    expect(owner).toMatch(/^[0-9a-f-]{36}$/);
    expect(renew).toHaveBeenCalledWith(owner);
    expect(release).toHaveBeenCalledWith(owner);
    expect(processBatch).toHaveBeenCalledWith(2, expect.any(Function));
  });
  it('fila restante mantém partial, inclusive tentativas aguardando prazo', async () => {
    findFirst.mockResolvedValue({ id: 'pending-event' });
    expect(await service.runBatch(1)).toEqual({ processedCount: 1, hasMore: true });
  });
  it('falha do banco/processador libera a reserva e propaga erro', async () => {
    processBatch.mockRejectedValue(new Error('forced-batch-failure'));
    await expect(service.runBatch(1)).rejects.toThrow('forced-batch-failure');
    expect(release).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('perda de reserva não vira execução concluída', async () => {
    renew.mockResolvedValue(false);
    await expect(service.runBatch(1)).rejects.toThrow('OUTBOX_RUN_LEASE_LOST');
    expect(findFirst).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('falha ao confirmar a reserva interrompe o lote como perda de posse', async () => {
    renew.mockRejectedValue(new Error('database-connection-failure'));
    await expect(service.runBatch(1)).rejects.toThrow('OUTBOX_RUN_LEASE_LOST');
    expect(findFirst).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
