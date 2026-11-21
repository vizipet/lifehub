import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationEmailService } from './notification-email.service';
import { NotificationsService } from './notifications.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxRunLeaseLostError } from './outbox-run-guard';

describe('OutboxProcessorService - perda de reserva G6.6', () => {
  const updateMany = jest.fn();
  const createFromOutboxEvent = jest.fn();
  const sendForNotification = jest.fn();
  const event = { id: 'event-fixture', type: 'APPOINTMENT_CONFIRMED', payload: {}, attemptCount: 1 };
  let service: OutboxProcessorService;
  beforeEach(() => {
    jest.resetAllMocks();
    createFromOutboxEvent.mockResolvedValue({ id: 'notification-fixture' });
    sendForNotification.mockResolvedValue('sent');
    updateMany.mockResolvedValue({ count: 1 });
    service = new OutboxProcessorService({ outboxEvent: { updateMany } } as unknown as PrismaService,
      { createFromOutboxEvent } as unknown as NotificationsService,
      { sendForNotification } as unknown as NotificationEmailService);
  });
  afterEach(() => jest.restoreAllMocks());
  it('perda antes do evento impede criação e envio', async () => {
    const guard = jest.fn().mockRejectedValue(new OutboxRunLeaseLostError());
    await expect(service.processClaimedEvent(event, guard)).rejects.toThrow('OUTBOX_RUN_LEASE_LOST');
    expect(createFromOutboxEvent).not.toHaveBeenCalled();
    expect(sendForNotification).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('perda depois da notificação impede início do envio', async () => {
    const guard = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new OutboxRunLeaseLostError());
    await expect(service.processClaimedEvent(event, guard)).rejects.toThrow('OUTBOX_RUN_LEASE_LOST');
    expect(createFromOutboxEvent).toHaveBeenCalledTimes(1);
    expect(sendForNotification).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('perda depois do envio não grava conclusão nem agenda retry de provedor', async () => {
    const guard = jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockRejectedValue(new OutboxRunLeaseLostError());
    await expect(service.processClaimedEvent(event, guard)).rejects.toThrow('OUTBOX_RUN_LEASE_LOST');
    expect(sendForNotification).toHaveBeenCalledTimes(1);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('lote para imediatamente ao perder reserva dentro do processamento', async () => {
    jest.spyOn(service, 'recoverStaleProcessingEvents').mockResolvedValue({ recovered: 0, failed: 0 });
    jest.spyOn(service, 'claimPendingBatch').mockResolvedValue([
      { ...event, status: 'PROCESSING', deduplicationKey: null, nextAttemptAt: null,
        processingStartedAt: new Date(), processedAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date() },
    ]);
    let calls = 0;
    const guard = async () => { if (++calls === 5) throw new OutboxRunLeaseLostError(); };
    await expect(service.processBatch(1, guard)).rejects.toThrow('OUTBOX_RUN_LEASE_LOST');
    expect(sendForNotification).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
