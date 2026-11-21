import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  NotificationEmailMessage,
  NotificationEmailSender,
} from './notification-email.contract';

/**
 * Entrega de e-mail para demonstração local: em vez de enviar pela internet,
 * cada mensagem vira um arquivo .txt em backend/mailbox e aparece no terminal.
 * Assim o professor consegue abrir o link de recuperação de senha sem
 * configurar nenhum provedor de e-mail.
 */
@Injectable()
export class LocalMailboxEmailSender implements NotificationEmailSender {
  private readonly logger = new Logger('Caixa de e-mails local');

  async send(message: NotificationEmailMessage): Promise<void> {
    const dir = resolve(process.cwd(), process.env.MAILBOX_DIR?.trim() || './mailbox');
    await mkdir(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeKey = message.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const file = join(dir, `${stamp}_${safeKey}.txt`);

    const content = [
      `Para: ${message.to}`,
      `Assunto: ${message.subject}`,
      `Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      '',
      message.text,
      '',
    ].join('\n');

    await writeFile(file, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    this.logger.log(`"${message.subject}" para ${message.to} → ${file}`);
  }
}
