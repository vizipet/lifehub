import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import type { JobName } from './job.contract';

/**
 * Substitui o cron externo na versão local: roda as tarefas internas
 * periodicamente dentro da própria API (desligue com LOCAL_JOBS=false).
 * As tarefas já usam "lease" no banco, então nunca rodam em duplicidade.
 */
const SCHEDULE: { job: JobName; everyMs: number }[] = [
  { job: 'outbox-processing', everyMs: 15_000 }, // e-mails e notificações
  { job: 'appointment-reminders', everyMs: 5 * 60_000 }, // lembretes de consulta
  { job: 'campaign-expiration', everyMs: 30 * 60_000 }, // encerra campanhas vencidas
];

@Injectable()
export class LocalJobScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Tarefas automáticas');
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Set<JobName>();

  constructor(private readonly jobs: JobsService) {}

  onApplicationBootstrap(): void {
    if (process.env.LOCAL_JOBS === 'false' || process.env.NODE_ENV === 'test') return;
    for (const { job, everyMs } of SCHEDULE) {
      const timer = setInterval(() => void this.tick(job), everyMs);
      timer.unref();
      this.timers.push(timer);
      setTimeout(() => void this.tick(job), 3_000).unref();
    }
    this.logger.log('Lembretes, e-mails e campanhas rodando automaticamente.');
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  private async tick(job: JobName): Promise<void> {
    if (this.running.has(job)) return;
    this.running.add(job);
    try {
      const result = await this.jobs.run(job);
      if (result.processedCount > 0) {
        this.logger.log(`${job}: ${result.processedCount} item(ns) processado(s).`);
      }
    } catch (error) {
      this.logger.warn(`${job} falhou: ${(error as Error).message}`);
    } finally {
      this.running.delete(job);
    }
  }
}
