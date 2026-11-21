export const NOTIFICATION_EMAIL_SENDER = Symbol(
  'NOTIFICATION_EMAIL_SENDER',
);

export interface NotificationEmailMessage {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export interface NotificationEmailSender {
  send(message: NotificationEmailMessage): Promise<void>;
}