/** Data e hora da consulta como o paciente lê: "segunda-feira, 23/11, 15:20". */
export function consultaWhen(date: Date): string {
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Recife',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
