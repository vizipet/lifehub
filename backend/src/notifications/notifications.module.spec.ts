import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  OUTBOX_CONTRACT,
  type OutboxContract,
} from '../auth/contracts/outbox.contract';
import { PrismaService } from '../common/prisma/prisma.service';
import { LocalMailboxEmailSender } from './local-mailbox-email.sender';
import { NOTIFICATION_EMAIL_SENDER } from './notification-email.contract';
import { NotificationEmailService } from './notification-email.service';
import { NotificationsModule } from './notifications.module';
import { OutboxProcessorService } from './outbox-processor.service';
import { OutboxService } from './outbox.service';

describe('NotificationsModule', () => {
  const testConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  ignoreEnvFile: true,
  skipProcessEnv: true,
  load: [
    () => ({
      JWT_ACCESS_SECRET: 'notifications-module-test-secret',
    }),
  ],
});
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('resolve os serviços de Outbox', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule, NotificationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const outbox =
      moduleRef.get<OutboxContract>(OUTBOX_CONTRACT);

    const processor = moduleRef.get(
      OutboxProcessorService,
    );

    const emailService = moduleRef.get(
      NotificationEmailService,
    );

    const emailSender = moduleRef.get(
      NOTIFICATION_EMAIL_SENDER,
    );

    expect(outbox).toBeInstanceOf(OutboxService);

    expect(processor).toBeInstanceOf(
      OutboxProcessorService,
    );

    expect(emailService).toBeInstanceOf(
      NotificationEmailService,
    );

    expect(emailSender).toHaveProperty(
      'send',
      expect.any(Function),
    );

    await moduleRef.close();
  });

  it('entrega e-mails na caixa local (sem provedor externo)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule, NotificationsModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(NOTIFICATION_EMAIL_SENDER)).toBeInstanceOf(LocalMailboxEmailSender);

    await moduleRef.close();
  });
});
