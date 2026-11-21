import { useMemo, useRef, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, MapPin, Video } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { jsonBody, messageOf, newIdempotencyKey, request } from '../../api';
import {
  dateLong,
  dayKey,
  modalityLabel,
  money,
  relationshipLabel,
  time,
  todayKey,
  tomorrowKey,
} from '../../lib/format';
import type { Patient, PublicProfessional, ServiceItem, Slot } from '../../lib/types';
import { ClinicMap } from '../../ui/ClinicMap';
import { useApi } from '../../lib/useApi';
import { Avatar, Checkbox, EmptyState, Notice, Skeleton, SkeletonCards } from '../../ui/kit';

interface BookingState {
  professional: { id: string; name: string; specialty: string | null; crm: string | null; crmState: string | null };
  clinic: PublicProfessional['clinics'][number];
  service: ServiceItem;
  slot: Slot;
}

export function DoctorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const doctor = useApi<{ data: PublicProfessional }>(id ? `/public/professionals/${id}` : null, false);
  const [serviceId, setServiceId] = useState('');
  const professional = doctor.data?.data;
  const service = professional?.services.find((item) => item.id === serviceId) ?? professional?.services[0];
  const clinic = professional?.clinics.find((item) => item.id === service?.clinicId);

  const slots = useApi<{ data: Slot[] }>(
    professional && service
      ? `/public/clinics/${service.clinicId}/availability?professionalId=${professional.id}&serviceId=${service.id}&limit=50`
      : null,
    false,
  );

  const byDay = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slots.data?.data ?? []) {
      const key = dayKey(slot.startsAt);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots.data]);

  if (doctor.loading) return <DoctorPageSkeleton />;
  if (doctor.error || !professional) return <Notice kind="error">{doctor.error || 'Médico não encontrado.'}</Notice>;

  function choose(slot: Slot) {
    if (!professional || !service || !clinic) return;
    const state: BookingState = {
      professional: {
        id: professional.id,
        name: professional.name,
        specialty: professional.specialty?.name ?? null,
        crm: professional.crm,
        crmState: professional.crmState,
      },
      clinic,
      service,
      slot,
    };
    navigate('/agendar', { state });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <aside className="card h-fit space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={professional.name} photoUrl={professional.photoUrl} size="lg" />
          <div>
            <h1 className="text-xl font-extrabold">{professional.name}</h1>
            <p className="text-sm text-muted">{professional.specialty?.name}</p>
          </div>
        </div>
        <p className="rounded-xl bg-soft p-2 text-sm">
          <strong>CRM {professional.crm}/{professional.crmState}</strong> · registro conferido pela equipe LifeHub
        </p>
        {professional.bio && <p className="text-muted">{professional.bio}</p>}
        <div>
          <h2 className="mb-1 font-bold">Locais</h2>
          {professional.clinics.map((item) => (
            <p key={item.id} className="flex items-start gap-1 text-sm text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.name} — {item.address}, {item.neighborhood}, {item.city}
            </p>
          ))}
          {/* Mapa do local do atendimento escolhido (muda junto ao trocar de atendimento). */}
          {clinic?.latitude != null && clinic.longitude != null && (
            <div className="mt-2">
              <ClinicMap key={clinic.id} name={clinic.name} latitude={clinic.latitude} longitude={clinic.longitude} />
            </div>
          )}
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="card">
          <h2 className="mb-3 text-lg font-extrabold">1. Escolha o atendimento</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {professional.services.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === service?.id}
                onClick={() => setServiceId(item.id)}
                className={`rounded-xl border p-3 text-left transition ${item.id === service?.id ? 'border-primary bg-soft' : 'border-line bg-papel hover:border-primary'}`}
              >
                <strong className="flex items-center gap-1">
                  {item.modality === 'REMOTE' && <Video className="size-4" aria-hidden />}
                  {item.name}
                </strong>
                <span className="block text-sm text-muted">
                  {modalityLabel[item.modality]} · {item.durationMinutes} min · {money(item.priceCents)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 text-lg font-extrabold">2. Escolha o horário</h2>
          <p className="mb-3 text-sm text-muted">Horário de Recife (UTC−3).</p>
          {slots.loading ? (
            <DayStripSkeleton />
          ) : byDay.length === 0 ? (
            <EmptyState title="Sem horários livres">Este atendimento não tem horários disponíveis agora.</EmptyState>
          ) : (
            <DayStrip byDay={byDay} onChoose={choose} />
          )}
        </div>
      </section>
    </div>
  );
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_STRIP_DAYS = 21;

/** Soma dias a uma chave AAAA-MM-DD (Recife não tem horário de verão). */
function addDaysToKey(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Faixa horizontal de dias ("Hoje 21", "Seg 23"…) com os horários do dia
 * escolhido embaixo. Dias sem vaga aparecem apagados, para o paciente ver
 * a semana inteira de uma vez.
 */
function DayStrip({ byDay, onChoose }: { byDay: [string, Slot[]][]; onChoose: (slot: Slot) => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState('');
  const slotsByKey = useMemo(() => new Map(byDay), [byDay]);

  const days = useMemo(() => {
    const first = byDay[0][0] < todayKey() ? byDay[0][0] : todayKey();
    const last = byDay[byDay.length - 1][0];
    const list: string[] = [];
    for (let key = first; key <= last && list.length < MAX_STRIP_DAYS; key = addDaysToKey(key, 1)) list.push(key);
    return list;
  }, [byDay]);

  // Trocar de atendimento pode sumir com o dia escolhido: cai no primeiro com vaga.
  const selected = slotsByKey.has(picked) ? picked : byDay[0][0];
  const selectedSlots = slotsByKey.get(selected) ?? [];

  function scrollBy(direction: 1 | -1) {
    const strip = stripRef.current;
    if (strip) strip.scrollBy({ left: direction * strip.clientWidth * 0.8, behavior: 'smooth' });
  }

  function label(key: string) {
    if (key === todayKey()) return 'Hoje';
    if (key === tomorrowKey()) return 'Amanhã';
    return WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost hidden shrink-0 px-2 sm:inline-flex" aria-label="Dias anteriores" onClick={() => scrollBy(-1)}>
          <ChevronLeft className="size-5" />
        </button>
        <div
          ref={stripRef}
          role="group"
          aria-label="Escolha o dia"
          className="-mx-1 flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
        >
          {days.map((key) => {
            const count = slotsByKey.get(key)?.length ?? 0;
            const active = key === selected;
            return (
              <button
                key={key}
                type="button"
                disabled={count === 0}
                aria-pressed={active}
                aria-label={`${label(key)}, dia ${Number(key.slice(8))}: ${count === 0 ? 'sem horários' : `${count} ${count === 1 ? 'horário' : 'horários'}`}`}
                onClick={() => setPicked(key)}
                className={`flex w-[4.5rem] shrink-0 snap-start flex-col items-center rounded-xl border px-2 py-2 transition ${
                  active
                    ? 'border-primary bg-primary text-on-accent shadow-sm'
                    : count === 0
                      ? 'cursor-not-allowed border-line bg-soft/60 text-muted opacity-50'
                      : 'border-line bg-papel hover:border-primary'
                }`}
              >
                <span className={`text-xs font-semibold ${active ? 'text-on-accent/85' : 'text-muted'}`}>{label(key)}</span>
                <span className="font-title text-2xl leading-tight font-bold">{Number(key.slice(8))}</span>
                <span className={`text-[0.7rem] ${active ? 'text-on-accent/85' : 'text-muted'}`}>
                  {count === 0 ? '—' : `${count} ${count === 1 ? 'vaga' : 'vagas'}`}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn btn-ghost hidden shrink-0 px-2 sm:inline-flex" aria-label="Próximos dias" onClick={() => scrollBy(1)}>
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div>
        <h3 className="mb-2 font-bold">{dateLong(selectedSlots[0]?.startsAt ?? `${selected}T12:00:00-03:00`)}</h3>
        <div className="flex flex-wrap gap-2">
          {selectedSlots.map((slot) => (
            <button key={slot.id} type="button" className="chip min-w-20 justify-center font-semibold" onClick={() => onChoose(slot)}>
              {time(slot.startsAt)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Esqueleto da página do médico: perfil à esquerda, atendimento e horários à direita. */
function DoctorPageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <span className="sr-only">Carregando médico...</span>
      <div className="card h-fit space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-20 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-9 w-full rounded-xl" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="min-w-0 space-y-4">
        <div className="card space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-16 w-full max-w-sm rounded-xl" />
        </div>
        <div className="card space-y-3">
          <Skeleton className="h-6 w-48" />
          <DayStripSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Faixa de dias e horários fantasmas. */
function DayStripSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Carregando horários...</span>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-[4.6rem] w-[4.5rem] shrink-0 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-5 w-52" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-20 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function BookingReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const booking = location.state as BookingState | null;
  const patients = useApi<{ data: Patient[] }>('/patients');
  const [patientId, setPatientId] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A mesma chave em todas as tentativas desta tela: clique duplo não duplica.
  const idempotencyKey = useRef(newIdempotencyKey());

  if (!booking) return <Navigate to="/buscar" replace />;
  const selected = patientId || patients.data?.data[0]?.id || '';
  const selectedPatient = patients.data?.data.find((item) => item.id === selected);

  async function confirm() {
    if (!booking) return;
    setBusy(true);
    setError('');
    try {
      await request('/appointments', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: jsonBody({
          patientId: selected,
          serviceId: booking.service.id,
          professionalId: booking.professional.id,
          clinicId: booking.clinic.id,
          slotId: booking.slot.id,
        }),
      });
      navigate('/agendado', { replace: true, state: { ...booking, patientName: selectedPatient?.name } });
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="page-title">Revise o agendamento</h1>
      {error && (
        <Notice kind="error" title="Não foi possível agendar">
          {error} <Link to={`/medicos/${booking.professional.id}`} className="font-semibold underline">Escolher outro horário</Link>
        </Notice>
      )}

      <div className="card">
        <h2 className="mb-3 text-lg font-extrabold">Quem será atendido?</h2>
        {patients.loading ? (
          <SkeletonCards count={2} lines={2} avatar label="Carregando pessoas..." />
        ) : (
          <div className="grid gap-2">
            {patients.data?.data.map((patient) => (
              <label
                key={patient.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${patient.id === selected ? 'border-primary bg-soft' : 'border-line'}`}
              >
                <input
                  type="radio"
                  name="paciente"
                  className="size-5 accent-[var(--color-primary)]"
                  checked={patient.id === selected}
                  onChange={() => setPatientId(patient.id)}
                />
                <span>
                  <strong>{patient.name}</strong>
                  <span className="block text-sm text-muted">
                    {relationshipLabel[patient.relationship]} · {patient.age} anos
                  </span>
                </span>
              </label>
            ))}
            <Link to="/pacientes" className="btn btn-ghost justify-start text-sm">+ Cadastrar dependente</Link>
          </div>
        )}
      </div>

      <dl className="card grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm text-muted">Médico</dt><dd className="font-semibold">{booking.professional.name}</dd><dd className="text-sm text-muted">{booking.professional.specialty} · CRM {booking.professional.crm}/{booking.professional.crmState}</dd></div>
        <div><dt className="text-sm text-muted">Quando</dt><dd className="font-semibold">{dateLong(booking.slot.startsAt)}</dd><dd className="text-sm">{time(booking.slot.startsAt)} às {time(booking.slot.endsAt)}</dd></div>
        <div><dt className="text-sm text-muted">Atendimento</dt><dd className="font-semibold">{booking.service.name} · {modalityLabel[booking.service.modality]}</dd><dd className="text-sm">{money(booking.service.priceCents)}, pago direto ao médico</dd></div>
        <div><dt className="text-sm text-muted">Local</dt><dd className="font-semibold">{booking.service.modality === 'REMOTE' ? 'Por vídeo (link enviado pelo médico)' : booking.clinic.name}</dd>{booking.service.modality !== 'REMOTE' && <dd className="text-sm">{booking.clinic.address}, {booking.clinic.neighborhood}</dd>}</div>
      </dl>

      <div className="card space-y-3">
        <Notice kind="info">
          O médico verá apenas o <strong>nome e a idade</strong> do paciente. Você pode cancelar pelo app antes da consulta.
        </Notice>
        <Checkbox checked={agree} onChange={setAgree}>
          Confirmo os dados acima e autorizo o compartilhamento do nome e da idade do paciente com o médico escolhido.
        </Checkbox>
        <button className="btn btn-primary w-full text-lg" disabled={!agree || busy || !selected} onClick={() => void confirm()}>
          <CalendarCheck className="size-5" /> {busy ? 'Confirmando...' : 'Confirmar agendamento'}
        </button>
      </div>
    </div>
  );
}

/** Check que se desenha na hora em que a consulta é confirmada. */
function SuccessCheck() {
  return (
    <div className="relative mx-auto mb-4 size-20" aria-hidden>
      <span className="check-ring absolute inset-0 rounded-full bg-success opacity-0" />
      <svg viewBox="0 0 48 48" className="check-pop relative size-20">
        <circle cx="24" cy="24" r="24" className="fill-success" />
        <path
          d="M14 24.5l7 7 13-14"
          fill="none"
          stroke="white"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="check-draw"
        />
      </svg>
    </div>
  );
}

export function BookingSuccessPage() {
  const location = useLocation();
  const state = location.state as (BookingState & { patientName?: string }) | null;
  if (!state) return <Navigate to="/agenda" replace />;
  return (
    <div className="mx-auto max-w-lg py-6 text-center">
      <SuccessCheck />
      <h1 className="page-title">Consulta agendada!</h1>
      <p className="mt-2 text-lg">
        {state.patientName} com {state.professional.name}, <span>{dateLong(state.slot.startsAt)}</span> às{' '}
        {time(state.slot.startsAt)}.
      </p>
      <p className="mt-1 text-muted">Você vai receber um lembrete antes da consulta.</p>
      <div className="mt-6 flex flex-col gap-2">
        <Link to="/agenda" className="btn btn-primary">Ver na minha agenda</Link>
        <Link to="/inicio" className="btn btn-secondary">Voltar ao início</Link>
      </div>
    </div>
  );
}
