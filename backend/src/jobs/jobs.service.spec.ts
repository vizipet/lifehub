import { Test } from '@nestjs/testing';
import { JOB_HANDLERS, JOB_NAMES } from './job.contract';
import { PrismaService } from '../common/prisma/prisma.service';
import type { JobBatchResult, JobContext, JobHandler } from './job.contract';
import { JobExecutionError } from './job-execution.error';
import { JobsModule } from './jobs.module';
import { JobsService } from './jobs.service';

describe('JobsService - base interna G6.1', () => {
  function fixture() {
    const execute = jest.fn<Promise<JobBatchResult>, [JobContext]>();
    execute.mockResolvedValue({ status: 'completed', processedCount: 2 });
    const handler: JobHandler = { name: 'appointment-reminders', execute };
    return { execute, handler, service: new JobsService([handler]) };
  }

  it('recusa nomes desconhecidos sem executar um handler', async () => {
    const { service, execute } = fixture();
    await expect(service.run('arbitrary-job')).rejects.toMatchObject({
      code: 'INVALID_JOB',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 26, NaN, Infinity, '10', null])(
    'recusa tamanho de lote inválido antes de executar: %s',
    async (batchSize) => {
      const { service, execute } = fixture();
      await expect(
        service.run('appointment-reminders', batchSize as number),
      ).rejects.toMatchObject({ code: 'INVALID_JOB_BATCH_SIZE' });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([1, 25])('aceita o limite de lote %s', async (batchSize) => {
    const { service, execute } = fixture();
    execute.mockResolvedValue({ status: 'completed', processedCount: 0 });
    await service.run('appointment-reminders', batchSize);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize }),
    );
  });

  it('executa somente o handler solicitado com identificação e lote padrão', async () => {
    const { handler, execute } = fixture();
    const otherExecute = jest.fn<Promise<JobBatchResult>, [JobContext]>();
    const service = new JobsService([
      handler,
      { name: 'outbox-processing', execute: otherExecute },
    ]);
    const result = await service.run('appointment-reminders');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      runId: result.runId,
      startedAt: expect.any(Date),
      batchSize: 10,
    });
    expect(result).toEqual({
      job: 'appointment-reminders',
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      status: 'completed',
      processedCount: 2,
    });
    expect(otherExecute).not.toHaveBeenCalled();
  });

  it('preserva resultado parcial sem repetir o handler por conta própria', async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValue({ status: 'partial', processedCount: 1 });
    await expect(service.run('appointment-reminders')).resolves.toMatchObject({
      status: 'partial',
      processedCount: 1,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('propaga falhas sem convertê-las em execução concluída', async () => {
    const { service, execute } = fixture();
    const failure = new Error('handler failed');
    execute.mockRejectedValue(failure);
    await expect(service.run('appointment-reminders')).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { status: 'completed', processedCount: -1 },
    { status: 'completed', processedCount: 0.5 },
    { status: 'completed', processedCount: 11 },
    { status: 'completed', processedCount: NaN },
    { status: 'completed', processedCount: Number.MAX_SAFE_INTEGER + 1 },
    { status: 'unknown', processedCount: 0 },
  ])('recusa resultado inválido: %j', async (result) => {
    const { service, execute } = fixture();
    execute.mockResolvedValue(result as JobBatchResult);
    await expect(service.run('appointment-reminders')).rejects.toMatchObject({
      code: 'INVALID_JOB_RESULT',
    });
  });

  it('retorna apenas campos do contrato, mesmo com detalhes extras do handler', async () => {
    const { service, execute } = fixture();
    execute.mockResolvedValue({
      status: 'completed',
      processedCount: 0,
      privateDetails: 'fixture-only',
    } as JobBatchResult);
    const result = await service.run('appointment-reminders');
    expect(Object.keys(result).sort()).toEqual([
      'job', 'processedCount', 'runId', 'status',
    ]);
  });

  it('recusa registros duplicados sem executar tarefas', () => {
    const { handler, execute } = fixture();
    expect(() => new JobsService([handler, handler])).toThrow(
      new JobExecutionError('INVALID_JOB_REGISTRATION'),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('recusa um nome inválido no registro de handlers', () => {
    const { execute } = fixture();
    const invalidHandler = { name: 'invalid', execute } as unknown as JobHandler;
    expect(() => new JobsService([invalidHandler])).toThrow(
      new JobExecutionError('INVALID_JOB_REGISTRATION'),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('compila a base com registro explicitamente vazio e banco substituído', async () => {
    const module = await Test.createTestingModule({ imports: [JobsModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(JOB_HANDLERS).useValue([])
      .compile();
    try {
      await module.init();
      const service = module.get(JobsService);
      for (const name of JOB_NAMES) {
        await expect(service.run(name)).rejects.toMatchObject({
          code: 'JOB_UNAVAILABLE',
        });
      }
    } finally {
      await module.close();
    }
  });
});
