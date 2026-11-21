import { ACCOUNT_DELETION_REQUESTED } from '../privacy/account-deletion.event';
import { NotificationSkippedError } from './notification-skipped.error';
import { PrismaService } from '../common/prisma/prisma.service';
import { OutboxStatus } from '../generated/prisma/client';
import { OutboxProcessorService } from './outbox-processor.service';
import { NotificationsService } from './notifications.service';
import { NotificationEmailService } from './notification-email.service';

describe('OutboxProcessorService', () => {
  let service: OutboxProcessorService;

  const findMany = jest.fn();
  const updateMany = jest.fn();
  const findUniqueOrThrow = jest.fn();
  const createFromOutboxEvent = jest.fn();

const notificationsService = {
  createFromOutboxEvent,
} as unknown as NotificationsService;
const sendForNotification = jest.fn();

const notificationEmailService = {
  sendForNotification,
} as unknown as NotificationEmailService;
  const prisma = {
    outboxEvent: {
      findMany,
      updateMany,
      findUniqueOrThrow,
    },
  } as unknown as PrismaService;

  const createdAt = new Date('2026-10-17T18:00:00.000Z');

  const pendingEvent = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'APPOINTMENT_CONFIRMED',
    deduplicationKey: null,
    payload: {
      appointmentId: 'appointment-id',
    },
    status: OutboxStatus.PENDING,
    attemptCount: 0,
    nextAttemptAt: null,
    processingStartedAt: null,
    processedAt: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  };

  beforeEach(() => {
  jest.clearAllMocks();

  createFromOutboxEvent.mockResolvedValue({
    id: 'notification-id',
  });

  sendForNotification.mockResolvedValue('sent');

  service = new OutboxProcessorService(
    prisma,
    notificationsService,
    notificationEmailService,
  );
});

  it('reivindica evento PENDING como PROCESSING', async () => {
    findMany.mockResolvedValue([pendingEvent]);

    updateMany.mockResolvedValue({
      count: 1,
    });

    findUniqueOrThrow.mockResolvedValue({
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 1,
      processingStartedAt: new Date(),
    });

    const result = await service.claimPendingBatch(5);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        status: OutboxStatus.PENDING,
        OR: [
          {
            nextAttemptAt: null,
          },
          {
            nextAttemptAt: {
              lte: expect.any(Date),
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        id: pendingEvent.id,
        status: OutboxStatus.PENDING,
        OR: [
          {
            nextAttemptAt: null,
          },
          {
            nextAttemptAt: {
              lte: expect.any(Date),
            },
          },
        ],
      },
      data: {
        status: OutboxStatus.PROCESSING,
        attemptCount: {
          increment: 1,
        },
        nextAttemptAt: null,
        processingStartedAt: expect.any(Date),
        lastError: null,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: pendingEvent.id,
        status: OutboxStatus.PROCESSING,
        attemptCount: 1,
      }),
    );
  });

  it('ignora evento reivindicado por outro processador', async () => {
    findMany.mockResolvedValue([pendingEvent]);

    updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await service.claimPendingBatch();

    expect(result).toEqual([]);
    expect(findUniqueOrThrow).not.toHaveBeenCalled();
  });

   it('limita o lote ao máximo configurado', async () => {
    findMany.mockResolvedValue([]);

    await service.claimPendingBatch(1000);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
      }),
    );
  });

  it('processa evento reivindicado e marca PROCESSED', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 1,
      processingStartedAt: new Date(),
    };

    updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.processClaimedEvent(
      processingEvent,
    );

    expect(
      createFromOutboxEvent,
    ).toHaveBeenCalledWith(processingEvent);

    expect(updateMany).toHaveBeenCalledWith({
  where: {
    type: { not: ACCOUNT_DELETION_REQUESTED },
    id: processingEvent.id,
    status: OutboxStatus.PROCESSING,
    attemptCount: processingEvent.attemptCount,
  },
      data: {
        status: OutboxStatus.PROCESSED,
        processedAt: expect.any(Date),
        processingStartedAt: null,
        nextAttemptAt: null,
        lastError: null,
      },
    });

    expect(result).toBe(true);
  });

  it('não conclui evento que deixou de estar PROCESSING', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 1,
    };

    updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await service.processClaimedEvent(
      processingEvent,
    );

    expect(
      createFromOutboxEvent,
    ).toHaveBeenCalledTimes(1);

    expect(result).toBe(false);
  });

  it('processa todo o lote reivindicado', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 1,
    };

    jest
      .spyOn(service, 'claimPendingBatch')
      .mockResolvedValue([
        processingEvent,
        {
          ...processingEvent,
          id: '22222222-2222-4222-8222-222222222222',
        },
      ]);

    updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.processBatch(10);
    jest
  .spyOn(service, 'recoverStaleProcessingEvents')
  .mockResolvedValue({
    recovered: 0,
    failed: 0,
  });

    expect(
      createFromOutboxEvent,
    ).toHaveBeenCalledTimes(2);

    expect(result).toEqual({
      claimed: 2,
      processed: 2,
    });
  });
  it('envia e-mail antes de concluir o evento', async () => {
  const processingEvent = {
    ...pendingEvent,
    status: OutboxStatus.PROCESSING,
    attemptCount: 1,
  };

  updateMany.mockResolvedValue({
    count: 1,
  });

  const result = await service.processClaimedEvent(
    processingEvent,
  );

  expect(createFromOutboxEvent).toHaveBeenCalledWith(
    processingEvent,
  );

  expect(sendForNotification).toHaveBeenCalledWith(
    'notification-id',
  );

  expect(updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: OutboxStatus.PROCESSED,
      }),
    }),
  );

  const createOrder =
    createFromOutboxEvent.mock.invocationCallOrder[0];

  const emailOrder =
    sendForNotification.mock.invocationCallOrder[0];

  const processedOrder =
    updateMany.mock.invocationCallOrder[0];

  expect(createOrder).toBeLessThan(emailOrder);
  expect(emailOrder).toBeLessThan(processedOrder);
  expect(result).toBe(true);
});
it('conclui o evento quando o e-mail está desativado', async () => {
  const processingEvent = {
    ...pendingEvent,
    status: OutboxStatus.PROCESSING,
    attemptCount: 1,
  };

  sendForNotification.mockResolvedValue('skipped');
  updateMany.mockResolvedValue({ count: 1 });

  const result = await service.processClaimedEvent(
    processingEvent,
  );

  expect(sendForNotification).toHaveBeenCalledWith(
    'notification-id',
  );

  expect(updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: OutboxStatus.PROCESSED,
      }),
    }),
  );

  expect(result).toBe(true);
});
it('não marca PROCESSED quando o envio de e-mail falha', async () => {
  const processingEvent = {
    ...pendingEvent,
    status: OutboxStatus.PROCESSING,
    attemptCount: 1,
  };

  sendForNotification.mockRejectedValue(
    new Error('Falha simulada no provedor'),
  );

  await expect(
    service.processClaimedEvent(processingEvent),
  ).rejects.toThrow('Falha simulada no provedor');

  expect(createFromOutboxEvent).toHaveBeenCalledTimes(1);
  expect(sendForNotification).toHaveBeenCalledTimes(1);

  expect(updateMany).not.toHaveBeenCalled();
});
  it('agenda nova tentativa após a primeira falha', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 1,
    };

    updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.markProcessingFailure(
      processingEvent,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        id: processingEvent.id,
        status: OutboxStatus.PROCESSING,
        attemptCount: 1,
      },
      data: {
        status: OutboxStatus.PENDING,
        nextAttemptAt: expect.any(Date),
        processingStartedAt: null,
        processedAt: null,
        lastError: 'NOTIFICATION_DELIVERY_FAILED',
      },
    });

    expect(result).toBe(true);
  });

  it('marca FAILED após a quinta tentativa', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 5,
    };

    updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.markProcessingFailure(
      processingEvent,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        id: processingEvent.id,
        status: OutboxStatus.PROCESSING,
        attemptCount: 5,
      },
      data: {
        status: OutboxStatus.FAILED,
        nextAttemptAt: null,
        processingStartedAt: null,
        processedAt: null,
        lastError: 'NOTIFICATION_DELIVERY_FAILED',
      },
    });

    expect(result).toBe(true);
  });

  it('não altera evento que deixou de estar PROCESSING', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 2,
    };

    updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await service.markProcessingFailure(
      processingEvent,
    );

    expect(result).toBe(false);
  });
    it('agenda retry e continua processando os outros eventos do lote', async () => {
    const firstEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 1,
    };

    const secondEvent = {
      ...firstEvent,
      id: '22222222-2222-4222-8222-222222222222',
    };

    jest
      .spyOn(service, 'claimPendingBatch')
      .mockResolvedValue([firstEvent, secondEvent]);

    sendForNotification.mockRejectedValueOnce(
      new Error('Falha simulada no provedor'),
    );

    updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.processBatch(10);
    jest
  .spyOn(service, 'recoverStaleProcessingEvents')
  .mockResolvedValue({
    recovered: 0,
    failed: 0,
  });

    expect(result).toEqual({
      claimed: 2,
      processed: 1,
    });

    expect(createFromOutboxEvent).toHaveBeenCalledTimes(2);
    expect(sendForNotification).toHaveBeenCalledTimes(2);

    expect(updateMany).toHaveBeenCalledTimes(2);

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          type: { not: ACCOUNT_DELETION_REQUESTED },
          id: firstEvent.id,
          status: OutboxStatus.PROCESSING,
          attemptCount: 1,
        },
        data: expect.objectContaining({
          status: OutboxStatus.PENDING,
          nextAttemptAt: expect.any(Date),
          lastError: 'NOTIFICATION_DELIVERY_FAILED',
        }),
      }),
    );

    expect(updateMany).toHaveBeenNthCalledWith(
  2,
  expect.objectContaining({
    where: {
      type: { not: ACCOUNT_DELETION_REQUESTED },
      id: secondEvent.id,
      status: OutboxStatus.PROCESSING,
      attemptCount: secondEvent.attemptCount,
    },
    data: expect.objectContaining({
      status: OutboxStatus.PROCESSED,
    }),
  }),
);
  });
it('marca FAILED após a quinta falha durante o processamento do lote', async () => {
    const processingEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 5,
    };

    jest
      .spyOn(service, 'claimPendingBatch')
      .mockResolvedValue([processingEvent]);

    sendForNotification.mockRejectedValueOnce(
      new Error('Falha simulada no provedor'),
    );

    updateMany.mockResolvedValue({
      count: 1,
    });

    const result = await service.processBatch(10);
    jest
  .spyOn(service, 'recoverStaleProcessingEvents')
  .mockResolvedValue({
    recovered: 0,
    failed: 0,
  });

    expect(result).toEqual({
      claimed: 1,
      processed: 0,
    });

    expect(createFromOutboxEvent).toHaveBeenCalledTimes(1);
    expect(sendForNotification).toHaveBeenCalledTimes(1);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        id: processingEvent.id,
        status: OutboxStatus.PROCESSING,
        attemptCount: 5,
      },
      data: {
        status: OutboxStatus.FAILED,
        nextAttemptAt: null,
        processingStartedAt: null,
        processedAt: null,
        lastError: 'NOTIFICATION_DELIVERY_FAILED',
      },
    });
  });
    it('recupera evento preso em PROCESSING', async () => {
    const staleEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 2,
      processingStartedAt: new Date(
        Date.now() - 20 * 60_000,
      ),
    };

    findMany.mockResolvedValue([staleEvent]);
    updateMany.mockResolvedValue({ count: 1 });

    const result =
      await service.recoverStaleProcessingEvents(10);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        status: OutboxStatus.PROCESSING,
        processingStartedAt: {
          lte: expect.any(Date),
        },
      },
      orderBy: [
        { processingStartedAt: 'asc' },
        { id: 'asc' },
      ],
      take: 10,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        id: staleEvent.id,
        status: OutboxStatus.PROCESSING,
        attemptCount: 2,
        processingStartedAt: staleEvent.processingStartedAt,
      },
      data: {
        status: OutboxStatus.PENDING,
        nextAttemptAt: expect.any(Date),
        processingStartedAt: null,
        processedAt: null,
        lastError: 'OUTBOX_PROCESSING_TIMEOUT',
      },
    });

    expect(result).toEqual({
      recovered: 1,
      failed: 0,
    });
  });

  it('marca FAILED ao recuperar evento com cinco tentativas', async () => {
    const staleEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 5,
      processingStartedAt: new Date(
        Date.now() - 20 * 60_000,
      ),
    };

    findMany.mockResolvedValue([staleEvent]);
    updateMany.mockResolvedValue({ count: 1 });

    const result =
      await service.recoverStaleProcessingEvents();

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: { not: ACCOUNT_DELETION_REQUESTED },
        id: staleEvent.id,
        status: OutboxStatus.PROCESSING,
        attemptCount: 5,
        processingStartedAt: staleEvent.processingStartedAt,
      },
      data: {
        status: OutboxStatus.FAILED,
        nextAttemptAt: null,
        processingStartedAt: null,
        processedAt: null,
        lastError: 'OUTBOX_PROCESSING_TIMEOUT',
      },
    });

    expect(result).toEqual({
      recovered: 0,
      failed: 1,
    });
  });

  it('não recupera evento alterado por outro processador', async () => {
    const staleEvent = {
      ...pendingEvent,
      status: OutboxStatus.PROCESSING,
      attemptCount: 2,
      processingStartedAt: new Date(
        Date.now() - 20 * 60_000,
      ),
    };

    findMany.mockResolvedValue([staleEvent]);

    updateMany.mockResolvedValue({
      count: 0,
    });

    const result =
      await service.recoverStaleProcessingEvents();

    expect(result).toEqual({
      recovered: 0,
      failed: 0,
    });
  });
    it('recupera eventos travados antes de buscar o lote PENDING', async () => {
    const recoverSpy = jest
      .spyOn(service, 'recoverStaleProcessingEvents')
      .mockResolvedValue({
        recovered: 1,
        failed: 0,
      });

    const claimSpy = jest
      .spyOn(service, 'claimPendingBatch')
      .mockResolvedValue([]);

    const result = await service.processBatch(10);

    expect(recoverSpy).toHaveBeenCalledWith(10);
    expect(claimSpy).toHaveBeenCalledWith(10);

    const recoveryOrder =
      recoverSpy.mock.invocationCallOrder[0];

    const claimOrder =
      claimSpy.mock.invocationCallOrder[0];

    expect(recoveryOrder).toBeLessThan(claimOrder);

    expect(result).toEqual({
      claimed: 0,
      processed: 0,
    });
  });

  it('finaliza lembrete obsoleto sem enviar e-mail ou agendar nova tentativa', async () => {
    createFromOutboxEvent.mockRejectedValue(new NotificationSkippedError());
    updateMany.mockResolvedValue({ count: 1 });
    expect(await service.processClaimedEvent({ ...pendingEvent, attemptCount: 1 })).toBe(true);
    expect(sendForNotification).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { type: { not: ACCOUNT_DELETION_REQUESTED }, id: pendingEvent.id, status: OutboxStatus.PROCESSING, attemptCount: 1 },
      data: { status: OutboxStatus.PROCESSED, processedAt: expect.any(Date),
        processingStartedAt: null, nextAttemptAt: null, lastError: null },
    });
  });
});
