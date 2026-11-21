import { AppointmentRemindersService } from '../appointments/appointment-reminders.service';
import { AppointmentRemindersJob } from './appointment-reminders.job';

describe('AppointmentRemindersJob', () => {
  it.each([true, false])('preserva o tamanho/instante e sinaliza trabalho restante=%s', async (hasMore) => {
    const enqueueBatch = jest.fn().mockResolvedValue({ processedCount: 1, hasMore });
    const job = new AppointmentRemindersJob({ enqueueBatch } as unknown as AppointmentRemindersService);
    const context = { runId: 'fixture', startedAt: new Date(), batchSize: 2 };
    await expect(job.execute(context)).resolves.toEqual({
      processedCount: 1, status: hasMore ? 'partial' : 'completed',
    });
    expect(enqueueBatch).toHaveBeenCalledWith(context.startedAt, 2);
    expect(enqueueBatch).toHaveBeenCalledTimes(1);
  });
});
