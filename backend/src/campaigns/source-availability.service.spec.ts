import { PrismaService } from '../common/prisma/prisma.service';
import { SourceAvailabilityService } from './source-availability.service';
import { SourceProbeService } from './source-probe.service';

describe('SourceAvailabilityService - limites e falhas', () => {
  const query = jest.fn();
  const execute = jest.fn();
  const check = jest.fn();
  let service: SourceAvailabilityService;
  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValueOnce([]).mockResolvedValue([{ exists: false }]);
    execute.mockResolvedValue(1);
    check.mockResolvedValue({ available: true });
    service = new SourceAvailabilityService({ $queryRaw: query, $executeRaw: execute } as unknown as PrismaService,
      { check } as unknown as SourceProbeService);
  });
  it.each([0, -1, 1.5, 26, NaN, Infinity])('recusa lote inválido: %s', async (size) => {
    await expect(service.checkBatch(new Date(), size)).rejects.toThrow('INVALID_SOURCE_AVAILABILITY_BATCH');
    expect(query).not.toHaveBeenCalled();
  });
  it('recusa data inválida antes do banco e da rede', async () => {
    await expect(service.checkBatch(new Date(NaN), 1)).rejects.toThrow('INVALID_SOURCE_AVAILABILITY_BATCH');
    expect(query).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });
  it('retorna lote vazio sem rede', async () => {
    expect(await service.checkBatch(new Date(), 1)).toEqual({ processedCount: 0, hasMore: false });
    expect(check).not.toHaveBeenCalled();
  });
  it('não conta um resultado antigo recusado pelo banco', async () => {
    query.mockReset().mockResolvedValueOnce([{ id: 'fixture', sourceUrl: 'https://www.gov.br/', version: '1' }])
      .mockResolvedValue([{ exists: true }]);
    execute.mockResolvedValue(0);
    expect(await service.checkBatch(new Date(), 1)).toEqual({ processedCount: 0, hasMore: true });
  });
  it('propaga falha inesperada e libera reservas desta chamada', async () => {
    query.mockReset().mockResolvedValueOnce([{ id: 'fixture', sourceUrl: 'https://www.gov.br/', version: '1' }]);
    check.mockRejectedValue(new Error('unexpected-probe-failure'));
    await expect(service.checkBatch(new Date(), 1)).rejects.toThrow('unexpected-probe-failure');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('não grava um resultado de probe fora do contrato', async () => {
    query.mockReset().mockResolvedValueOnce([{ id: 'fixture', sourceUrl: 'https://www.gov.br/', version: '1' }]);
    check.mockResolvedValue({ available: false, failure: 'private-uncontrolled-text' });
    await expect(service.checkBatch(new Date(), 1)).rejects.toThrow('INVALID_SOURCE_PROBE_RESULT');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
