import { type FormEvent, useMemo, useState } from 'react';
import { Ban, CalendarPlus, Plus, Trash2, Unlock } from 'lucide-react';
import { jsonBody, messageOf, request } from '../../api';
import { dateLong, dayKey, modalityLabel, money, time } from '../../lib/format';
import type { Modality, ServiceItem, Slot } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { EmptyState, Field, Modal, Notice, PageHeader, SelectField, SkeletonCards, StatusPill, Tooltip } from '../../ui/kit';
import { ClinicPicker, useServices } from './ProfessionalPages';
import { useProfessional } from './useProfessional';

export function ServicesPage() {
  const pro = useProfessional();
  const [clinicId, setClinicId] = useState('');
  const services = useServices(clinicId);
  const [form, setForm] = useState({ name: 'Consulta', description: '', modality: 'IN_PERSON' as Modality, durationMinutes: '30', price: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ServiceItem | null>(null);
  const [deleteError, setDeleteError] = useState('');

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!pro.profile) return;
    setBusy(true);
    setError('');
    try {
      await request(`/clinics/${clinicId}/services`, {
        method: 'POST',
        body: jsonBody({
          name: form.name,
          ...(form.description ? { description: form.description } : {}),
          modality: form.modality,
          durationMinutes: Number(form.durationMinutes),
          ...(form.price ? { priceCents: Math.round(Number(form.price.replace(',', '.')) * 100) } : {}),
          professionalIds: [pro.profile.id],
        }),
      });
      setMessage('Serviço cadastrado.');
      services.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await request(`/clinics/${clinicId}/services/${deleting.id}`, { method: 'DELETE' });
      setMessage(`Serviço "${deleting.name}" excluído.`);
      setDeleting(null);
      services.reload();
    } catch (err) {
      // Serviço já usado não pode ser apagado: a mensagem orienta a desativar.
      setDeleteError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    try {
      await request(`/clinics/${clinicId}/services/${id}`, { method: 'PATCH', body: jsonBody({ isActive: !isActive }) });
      services.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Meus serviços" subtitle="O que os pacientes podem agendar com você." />
      <div className="card"><ClinicPicker value={clinicId} onChange={setClinicId} /></div>
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {clinicId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2">
            {services.loading ? (
              <SkeletonCards count={3} lines={2} action label="Carregando serviços..." />
            ) : services.data?.data.length ? (
              services.data.data.map((service) => (
                <div key={service.id} className="card flex items-center gap-3">
                  <div className="flex-1">
                    <strong>{service.name}</strong>
                    <p className="text-sm text-muted">{modalityLabel[service.modality]} · {service.durationMinutes} min · {money(service.priceCents)}</p>
                  </div>
                  <StatusPill tone={service.isActive === false ? 'gray' : 'green'}>{service.isActive === false ? 'Inativo' : 'Ativo'}</StatusPill>
                  <Tooltip
                    text={
                      service.isActive === false
                        ? 'Volta a aparecer na busca.'
                        : 'Some da busca. Consultas marcadas continuam.'
                    }
                  >
                    <button className="btn btn-ghost text-sm" onClick={() => void toggle(service.id, service.isActive !== false)}>
                      {service.isActive === false ? 'Ativar' : 'Desativar'}
                    </button>
                  </Tooltip>
                  <Tooltip
                    align="end"
                    text="Apaga de vez. Só se nunca foi usado."
                  >
                    <button
                      className="btn btn-ghost px-3 text-danger"
                      aria-label={`Excluir ${service.name}`}
                      onClick={() => { setDeleteError(''); setDeleting(service); }}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </Tooltip>
                </div>
              ))
            ) : (
              <EmptyState title="Nenhum serviço">Cadastre o primeiro ao lado.</EmptyState>
            )}
          </section>
          <form className="card space-y-3" onSubmit={(e) => void create(e)}>
            <h2 className="text-lg font-extrabold">Novo serviço</h2>
            <Field label="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Modalidade" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value as Modality })}>
                <option value="IN_PERSON">Presencial</option>
                <option value="REMOTE">Teleconsulta</option>
              </SelectField>
              <Field label="Duração (min)" type="number" min={10} max={240} required value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
              <Field label="Valor (R$)" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <button className="btn btn-primary" disabled={busy}><Plus className="size-5" /> Cadastrar</button>
          </form>
        </div>
      )}

      <Modal open={Boolean(deleting)} title="Excluir serviço?" onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="space-y-4">
            <p>
              <strong>{deleting.name}</strong> ({modalityLabel[deleting.modality].toLowerCase()}, {money(deleting.priceCents)}) será apagado.
              Só é possível excluir serviço que nunca teve horários nem consultas.
            </p>
            <Notice kind="info">A exclusão fica registrada no histórico da administração.</Notice>
            {deleteError && <Notice kind="error">{deleteError}</Notice>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setDeleting(null)}>Cancelar</button>
              {deleteError && deleting.isActive !== false ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => { void toggle(deleting.id, true); setDeleting(null); }}>
                  Desativar em vez disso
                </button>
              ) : (
                <button className="btn btn-danger" disabled={busy} onClick={() => void remove()}>Excluir</button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const WEEKDAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

/** Monta os horários no fuso de Recife (UTC−3). */
function buildSlots(opts: { from: string; to: string; days: number[]; start: string; end: string; duration: number; serviceId: string; professionalId: string }) {
  const slots: { serviceId: string; professionalId: string; startsAt: string; endsAt: string }[] = [];
  const [sh, sm] = opts.start.split(':').map(Number);
  const [eh, em] = opts.end.split(':').map(Number);
  for (let day = new Date(`${opts.from}T00:00:00Z`); day <= new Date(`${opts.to}T00:00:00Z`); day = new Date(day.getTime() + 86_400_000)) {
    if (!opts.days.includes(day.getUTCDay())) continue;
    const base = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) + 3 * 3600_000;
    let cursor = base + (sh * 60 + sm) * 60_000;
    const limit = base + (eh * 60 + em) * 60_000;
    while (cursor + opts.duration * 60_000 <= limit) {
      if (cursor > Date.now()) {
        slots.push({
          serviceId: opts.serviceId,
          professionalId: opts.professionalId,
          startsAt: new Date(cursor).toISOString(),
          endsAt: new Date(cursor + opts.duration * 60_000).toISOString(),
        });
      }
      cursor += opts.duration * 60_000;
    }
  }
  return slots;
}

export function SlotsPage() {
  const pro = useProfessional();
  const [clinicId, setClinicId] = useState('');
  const services = useServices(clinicId);
  const slots = useApi<{ data: Slot[] }>(clinicId ? `/clinics/${clinicId}/availability` : null);
  const today = new Date().toISOString().slice(0, 10);
  const [gen, setGen] = useState({ serviceId: '', from: today, to: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10), start: '08:00', end: '12:00', days: [1, 2, 3, 4, 5] });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const activeServices = services.data?.data.filter((item) => item.isActive !== false) ?? [];
  const service = activeServices.find((item) => item.id === gen.serviceId) ?? activeServices[0];
  const preview = useMemo(
    () => (service && pro.profile ? buildSlots({ ...gen, duration: service.durationMinutes, serviceId: service.id, professionalId: pro.profile.id }) : []),
    [gen, service, pro.profile],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of slots.data?.data ?? []) map.set(dayKey(slot.startsAt), [...(map.get(dayKey(slot.startsAt)) ?? []), slot]);
    return [...map.entries()];
  }, [slots.data]);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!preview.length) {
      setError('Nenhum horário no período escolhido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(`/clinics/${clinicId}/availability/batch`, { method: 'POST', body: jsonBody({ slots: preview }) });
      setMessage(`${preview.length} horários abertos.`);
      slots.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function setBlocked(slot: Slot, block: boolean) {
    setError('');
    try {
      await request(`/clinics/${clinicId}/availability/${slot.id}/${block ? 'block' : 'unblock'}`, { method: 'PATCH' });
      slots.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Horários" subtitle="Abra horários em lote e bloqueie quando precisar." />
      <div className="card"><ClinicPicker value={clinicId} onChange={setClinicId} /></div>
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {clinicId && (
        <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
          <form className="card h-fit space-y-3" onSubmit={(e) => void generate(e)}>
            <h2 className="text-lg font-extrabold">Abrir horários</h2>
            {activeServices.length === 0 ? (
              <Notice kind="info">Cadastre um serviço antes de abrir horários.</Notice>
            ) : (
              <>
                <SelectField label="Serviço" value={service?.id ?? ''} onChange={(e) => setGen({ ...gen, serviceId: e.target.value })}>
                  {activeServices.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.durationMinutes} min, {modalityLabel[item.modality]})</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="De" type="date" min={today} value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} />
                  <Field label="Até" type="date" min={gen.from} value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} />
                  <Field label="Início" type="time" value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} />
                  <Field label="Fim" type="time" value={gen.end} onChange={(e) => setGen({ ...gen, end: e.target.value })} />
                </div>
                <fieldset>
                  <legend className="label">Dias da semana</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const on = gen.days.includes(day.value);
                      return (
                        <button type="button" key={day.value} aria-pressed={on} className={`chip ${on ? 'chip-active' : ''}`}
                          onClick={() => setGen({ ...gen, days: on ? gen.days.filter((d) => d !== day.value) : [...gen.days, day.value] })}>
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <p className="text-sm text-muted">{preview.length} horário(s) serão criados. Horários que se sobrepõem aos existentes são recusados.</p>
                <Tooltip full text="Cria os horários na sua agenda.">
                  <button className="btn btn-primary w-full" disabled={busy || !preview.length}><CalendarPlus className="size-5" /> Abrir horários</button>
                </Tooltip>
              </>
            )}
          </form>

          <section>
            <h2 className="mb-2 text-lg font-extrabold">Próximos 14 dias</h2>
            {slots.loading ? (
              <SkeletonCards count={3} lines={3} label="Carregando horários..." />
            ) : byDay.length === 0 ? (
              <EmptyState title="Nenhum horário aberto">Use o formulário para abrir sua agenda.</EmptyState>
            ) : (
              <div className="space-y-3">
                {byDay.map(([key, list]) => (
                  <div key={key} className="card">
                    <h3 className="mb-2 font-bold">{dateLong(list[0].startsAt)}</h3>
                    <div className="flex flex-wrap gap-2">
                      {list.map((slot) => (
                        <span key={slot.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${slot.status === 'BOOKED' ? 'border-primary bg-primary text-on-accent' : slot.status === 'BLOCKED' ? 'border-line bg-ink/5 text-muted line-through' : 'border-line bg-papel'}`}>
                          {time(slot.startsAt)}
                          {slot.service?.modality === 'REMOTE' && ' · vídeo'}
                          {slot.status === 'AVAILABLE' && (
                            <Tooltip text="Ninguém poderá marcar este horário.">
                              <button className="ml-1 rounded p-1 hover:bg-soft" aria-label={`Bloquear ${time(slot.startsAt)}`} onClick={() => void setBlocked(slot, true)}><Ban className="size-4" /></button>
                            </Tooltip>
                          )}
                          {slot.status === 'BLOCKED' && (
                            <Tooltip text="Libera o horário para marcação.">
                              <button className="ml-1 rounded p-1 hover:bg-soft" aria-label={`Liberar ${time(slot.startsAt)}`} onClick={() => void setBlocked(slot, false)}><Unlock className="size-4" /></button>
                            </Tooltip>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-sm text-muted">Legenda: verde-escuro = reservado · riscado = bloqueado.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
