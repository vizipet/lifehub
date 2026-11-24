import { useState } from 'react';
import { Teleconsultation } from '../../ui/Teleconsultation';
import { CalendarDays, MapPin, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { jsonBody, messageOf, request } from '../../api';
import {
  appointmentStatusLabel,
  dateLong,
  modalityLabel,
  money,
  relationshipLabel,
  time,
} from '../../lib/format';
import type { Appointment } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { EmptyState, Modal, Notice, PageHeader, SkeletonCards, StatusPill } from '../../ui/kit';

const VIEWS = [
  { value: 'upcoming', label: 'Próximas' },
  { value: 'past', label: 'Histórico' },
  { value: 'cancelled', label: 'Canceladas' },
] as const;

const REASONS = ['Não poderei comparecer', 'Encontrei outro horário', 'Já me sinto melhor', 'Outro motivo'];

function statusTone(status: Appointment['status']) {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'COMPLETED') return 'blue';
  return 'red';
}

/** Tempo da animação de saída do cartão (igual ao .card-leaving no CSS). */
export const CARD_LEAVE_MS = 300;

export function AppointmentCard({
  appointment,
  onCancel,
  onRevokePhoto,
  leaving = false,
}: {
  appointment: Appointment;
  onCancel?: (appointment: Appointment) => void;
  onRevokePhoto?: (appointment: Appointment) => void;
  leaving?: boolean;
}) {
  const start = appointment.slot.startsAt;
  const remote = appointment.serviceModalitySnapshot === 'REMOTE';
  return (
    <article className={`card ${leaving ? 'card-leaving' : ''}`} aria-hidden={leaving || undefined}>
      <div className="flex gap-3">
        <div className="grid w-16 shrink-0 place-items-center rounded-lg bg-soft py-2 text-primary">
          <span className="font-title text-2xl font-extrabold leading-none">{new Date(start).toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'America/Recife' })}</span>
          <span className="text-sm font-bold">{new Date(start).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Recife' }).replace('.', '')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl">{appointment.professionalNameSnapshot}</h3>
            <StatusPill tone={statusTone(appointment.status)}>{appointmentStatusLabel[appointment.status]}</StatusPill>
          </div>
          <p className="text-muted">{dateLong(start)}, às {time(start)}</p>
          <p>
            Paciente: <strong>{appointment.patient.name}</strong> ({relationshipLabel[appointment.patient.relationship]})
          </p>
          <p className="flex items-start gap-1.5 text-muted">
            {remote ? <Video className="mt-1 size-4 shrink-0" aria-hidden /> : <MapPin className="mt-1 size-4 shrink-0" aria-hidden />}
            <span>
              {appointment.serviceNameSnapshot}, {modalityLabel[appointment.serviceModalitySnapshot].toLowerCase()}
              {remote ? ', por vídeo' : `, ${appointment.clinicAddressSnapshot}`}
            </span>
          </p>
          <p className="text-muted">{money(appointment.servicePriceCentsSnapshot)}</p>
          {appointment.cancellationReason && <p className="mt-1 text-danger">Motivo: {appointment.cancellationReason}</p>}
        </div>
      </div>
      <Teleconsultation appointment={appointment} />
      {onRevokePhoto && appointment.photoShared && <button className="btn btn-ghost mt-2 text-sm" onClick={() => onRevokePhoto(appointment)}>Parar de compartilhar foto</button>}
      {onCancel && appointment.status === 'CONFIRMED' && new Date(start) > new Date() && (
        <div className="mt-3 flex justify-end">
          <button className="btn btn-secondary border-danger text-danger" onClick={() => onCancel(appointment)}>Cancelar consulta</button>
        </div>
      )}
    </article>
  );
}

export function AppointmentsPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]['value']>('upcoming');
  const list = useApi<{ data: Appointment[] }>(`/appointments?view=${view}`);
  const [target, setTarget] = useState<Appointment | null>(null);
  const [photoTarget, setPhotoTarget] = useState<Appointment | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [leavingId, setLeavingId] = useState<string | null>(null);

  async function revokePhoto() {
    if (!photoTarget || busy) return;
    setBusy(true);
    setError('');
    try {
      await request(`/appointments/${photoTarget.id}/patient-photo`, { method: 'DELETE' });
      setPhotoTarget(null);
      setMessage('Compartilhamento da foto revogado. Sua consulta continua agendada.');
      list.reload({ quiet: true });
    } catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await request(`/appointments/${target.id}/cancel`, { method: 'PATCH', body: jsonBody({ reason }) });
      const cancelledId = target.id;
      setTarget(null);
      setMessage('Consulta cancelada. O horário foi liberado para outra pessoa.');
      // O cartão some suavemente; depois a lista se atualiza sem piscar.
      setLeavingId(cancelledId);
      window.setTimeout(() => {
        list.setData((current) => (current ? { ...current, data: current.data.filter((item) => item.id !== cancelledId) } : current));
        setLeavingId(null);
        list.reload({ quiet: true });
      }, CARD_LEAVE_MS);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Minha agenda" action={<Link to="/buscar" className="btn btn-primary">Nova consulta</Link>} />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filtro da agenda">
        {VIEWS.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={view === item.value}
            className={`chip ${view === item.value ? 'chip-active' : ''}`}
            onClick={() => {
              setView(item.value);
              setMessage('');
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {message && <div className="mb-3"><Notice kind="success">{message}</Notice></div>}
      {list.error && <Notice kind="error">{list.error}</Notice>}
      {list.loading ? (
        <SkeletonCards count={4} lines={4} grid="md:grid-cols-2" label="Carregando consultas..." />
      ) : list.data?.data.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.data.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              leaving={appointment.id === leavingId}
              onCancel={(item) => { setTarget(item); setError(''); }}
              onRevokePhoto={(item) => { setPhotoTarget(item); setError(''); }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays className="size-7" />}
          title={view === 'upcoming' ? 'Nenhuma consulta agendada' : 'Nada por aqui'}
          action={view === 'upcoming' ? <Link to="/buscar" className="btn btn-primary">Agendar consulta</Link> : undefined}
        >
          {view === 'upcoming' ? 'Quando você marcar um atendimento, ele aparece aqui.' : undefined}
        </EmptyState>
      )}

      <Modal open={Boolean(photoTarget)} title="Parar de compartilhar foto?" onClose={() => { if (!busy) setPhotoTarget(null); }}>
        <p>O médico não poderá mais consultar a foto do paciente nesta consulta. O agendamento continuará válido.</p>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn btn-secondary" disabled={busy} onClick={() => setPhotoTarget(null)}>Voltar</button>
          <button className="btn btn-danger" disabled={busy} onClick={() => void revokePhoto()}>Revogar autorização</button>
        </div>
      </Modal>
      <Modal open={Boolean(target)} title="Cancelar consulta?" onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-4">
            <Notice kind="warning">
              A consulta de <strong>{target.patient.name}</strong> com {target.professionalNameSnapshot} em{' '}
              <span>{dateLong(target.slot.startsAt)}</span>, às {time(target.slot.startsAt)}, será cancelada e o horário
              ficará livre para outra pessoa.
            </Notice>
            {error && <Notice kind="error">{error}</Notice>}
            <fieldset>
              <legend className="label">Motivo</legend>
              <div className="grid gap-2">
                {REASONS.map((item) => (
                  <label key={item} className="flex items-center gap-2">
                    <input type="radio" name="motivo" className="size-5 accent-[var(--color-primary)]" checked={reason === item} onChange={() => setReason(item)} />
                    {item}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn btn-secondary" onClick={() => setTarget(null)}>Manter consulta</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => void cancel()}>
                {busy ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
