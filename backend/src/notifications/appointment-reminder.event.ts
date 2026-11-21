export const APPOINTMENT_REMINDER_24H = 'APPOINTMENT_REMINDER_24H';
export const REMINDER_KEY_SUFFIX = ':reminder:24h';
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function reminderKey(appointmentId: string): string {
  if (!UUID.test(appointmentId) || appointmentId.trim() !== appointmentId) {
    throw new Error('INVALID_REMINDER_APPOINTMENT');
  }
  return `${appointmentId.toLowerCase()}${REMINDER_KEY_SUFFIX}`;
}

export function reminderAppointmentId(key: string): string {
  if (!key.endsWith(REMINDER_KEY_SUFFIX)) throw new Error('INVALID_REMINDER_KEY');
  const id = key.slice(0, -REMINDER_KEY_SUFFIX.length);
  if (reminderKey(id) !== key) throw new Error('INVALID_REMINDER_KEY');
  return id;
}
