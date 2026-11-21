// A due reminder can become obsolete before its asynchronous delivery.
export class NotificationSkippedError extends Error {
  constructor() {
    super('REMINDER_NO_LONGER_ELIGIBLE');
    this.name = 'NotificationSkippedError';
  }
}
