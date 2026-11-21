import type {
  DomainEvent,
  TransactionClient,
} from '../auth/contracts/outbox.contract';
import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  let service: OutboxService;

  const create = jest.fn();

  const tx = {
    outboxEvent: {
      create,
    },
  } as unknown as TransactionClient;

  beforeEach(() => {
    jest.clearAllMocks();

    create.mockResolvedValue({
      id: 'outbox-event-id',
    });

    service = new OutboxService();
  });

  it('registra o evento usando o transaction client recebido', async () => {
    const event: DomainEvent = {
      type: 'APPOINTMENT_CONFIRMED',
      payload: {
        appointmentId: 'appointment-id',
      },
    };

    await service.emitOutbox(event, tx);

    expect(create).toHaveBeenCalledWith({
      data: {
        type: 'APPOINTMENT_CONFIRMED',
        payload: {
          appointmentId: 'appointment-id',
        },
      },
    });
  });
});