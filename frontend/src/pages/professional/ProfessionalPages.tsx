import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, Circle, FileUp, Pencil, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { jsonBody, messageOf, request } from '../../api';
import { useAuth } from '../../lib/auth';
import { dateLong, firstName, onlyDigits, modalityLabel, professionalStatusLabel, relationshipLabel, time, verificationLabel } from '../../lib/format';
import type { Appointment, Clinic, Specialty, VerificationStatus } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { EmptyState, Field, Modal, Notice, PageHeader, SelectField, SkeletonCards, SkeletonPage, StatusPill, TextArea, Tooltip } from '../../ui/kit';
import { useProfessional } from './useProfessional';
import { ProfilePhoto } from './ProfilePhoto';
import { CARD_LEAVE_MS } from '../patient/AppointmentsPage';
import { Teleconsultation } from '../../ui/Teleconsultation';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export function verificationTone(status: VerificationStatus) {
  return status === 'APPROVED' ? 'green' : status === 'PENDING' ? 'yellow' : status === 'CHANGES_REQUESTED' ? 'blue' : 'red';
}

const AGENDA_VIEWS = [
  { value: 'open', label: 'Em aberto' },
  { value: 'past', label: 'Histórico' },
  { value: 'cancelled', label: 'Cancelados' },
] as const;

function appointmentStatusForDoctor(status: Appointment['status']) {
  return {
    CONFIRMED: 'Não concluído',
    COMPLETED: 'Concluído',
    CANCELLED_BY_PATIENT: 'Cancelado pelo paciente',
    CANCELLED_BY_PROVIDER: 'Cancelado por você',
    CANCELLED_AUTOMATICALLY: 'Cancelado automaticamente',
  }[status];
}

const MODAL_TITLES = {
  complete: 'Concluir atendimento?',
  attendance: 'Registrar presença?',
  cancel: 'Cancelar atendimento?',
  confirmLink: 'Vínculo conferido?',
  mismatch: 'Vínculo não confere',
} as const;

/** Consulta de dependente ainda sem a conferência presencial do vínculo. */
function needsLinkCheck(item: Appointment) {
  return Boolean(item.patient.guardianName) && item.dependentCheckResult !== 'CONFIRMED';
}

function SharedPatientAvatar({ item }: { item: Appointment }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const permitted = item.photoShared === true && item.status === 'CONFIRMED';
  useEffect(() => {
    setPhoto(null);
    if (!permitted) return;
    let active = true;
    let pending = false;
    async function refresh() {
      if (!active || pending) return;
      if (Date.now() >= Date.parse(item.slot.endsAt)) { setPhoto(null); return; }
      pending = true;
      try {
        const res = await request<{ data: { base64: string } }>(`/appointments/${item.id}/patient-photo`, { cache: 'no-store' });
        if (active && Date.now() < Date.parse(item.slot.endsAt)) setPhoto(res.data.base64);
      } catch { if (active) setPhoto(null); }
      finally { pending = false; }
    }
    void refresh();
    // Recheck authorization while the agenda is open, without persisting photos.
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [item.id, item.slot.endsAt, permitted]);
  const words = item.patient.name.trim().split(/\s+/);
  const initials = (words[0]?.[0] || '') + (words.length > 1 ? words[words.length - 1][0] : '');
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-primary bg-soft p-0.5 text-sm font-bold text-primary" aria-hidden>
      {permitted && photo ? <img className="size-full rounded-full object-cover" alt="" src={'data:image/jpeg;base64,' + photo} onError={() => setPhoto(null)} /> : initials}
    </span>
  );
}

export function ProfessionalDashboard() {
  const { user } = useAuth();
  const pro = useProfessional();
  // "Em aberto": confirmadas ainda não concluídas, inclusive as que já começaram.
  // "Em aberto": confirmadas ainda não concluídas, inclusive as que já começaram.
  const [agendaView, setAgendaView] = useState<'open' | 'past' | 'cancelled'>('open');
  const agenda = useApi<{ data: Appointment[] }>(pro.profile ? `/appointments?view=${agendaView}` : null);
  const [target, setTarget] = useState<{ appointment: Appointment; action: 'complete' | 'attendance' | 'cancel' | 'confirmLink' | 'mismatch' } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [leavingId, setLeavingId] = useState<string | null>(null);

  const reloadAgenda = agenda.reload;
  useEffect(() => {
    if (!pro.profile) return;
    const refresh = () => reloadAgenda({ quiet: true });
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [pro.profile?.id, reloadAgenda]);

  const approved = pro.profile?.verificationStatus === 'APPROVED';
  const approvedClinic = pro.clinics.some((clinic) => clinic.verificationStatus === 'APPROVED');

  async function act() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      if (target.action === 'attendance') {
        await request(`/appointments/${target.appointment.id}/attendance`, { method: 'PATCH' });
      } else if (target.action === 'complete') {
        await request(`/appointments/${target.appointment.id}/complete`, { method: 'PATCH' });
      } else if (target.action === 'confirmLink' || target.action === 'mismatch') {
        await request(`/appointments/${target.appointment.id}/dependent-check`, {
          method: 'PATCH',
          body: jsonBody(
            target.action === 'confirmLink'
              ? { result: 'CONFIRMED' }
              : { result: 'MISMATCH', ...(reason.trim() ? { note: reason.trim() } : {}) },
          ),
        });
      } else {
        await request(`/appointments/${target.appointment.id}/cancel`, { method: 'PATCH', body: jsonBody({ reason }) });
      }
      const { appointment, action } = target;
      setTarget(null);
      // Concluir, cancelar ou "não confere" tiram a consulta da lista: o cartão some suavemente.
      if (action === 'confirmLink' || action === 'attendance') {
        agenda.reload({ quiet: true });
      } else {
        setLeavingId(appointment.id);
        window.setTimeout(() => {
          agenda.setData((current) => (current ? { ...current, data: current.data.filter((item) => item.id !== appointment.id) } : current));
          setLeavingId(null);
          agenda.reload({ quiet: true });
        }, CARD_LEAVE_MS);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (pro.loading) return <SkeletonPage />;

  return (
    <div className="space-y-5">
      <PageHeader title={`Olá, ${user ? firstName(user.name) : ''}`} subtitle="Sua agenda e o andamento do seu cadastro." />
      {pro.error && <Notice kind="error">{pro.error}</Notice>}

      {!pro.profile ? (
        <Notice kind="warning" title="Complete seu cadastro profissional">
          Informe CRM e especialidade para começar. <Link to="/medico/cadastro" className="font-semibold underline">Continuar cadastro</Link>
        </Notice>
      ) : !approved ? (
        <Notice kind={pro.profile.verificationStatus === 'REJECTED' ? 'error' : 'info'} title={`Cadastro: ${professionalStatusLabel(pro.profile.verificationStatus, pro.profile.verificationSubmittedAt)}`}>
          {pro.profile.verificationSubmittedAt
            ? 'A equipe LifeHub está analisando seus documentos. Você será avisado por notificação.'
            : 'Envie seus documentos para análise. Enquanto não for aprovado, você não aparece na busca.'}{' '}
          <Link to="/medico/cadastro" className="font-semibold underline">Ver cadastro</Link>
        </Notice>
      ) : !approvedClinic ? (
        <Notice kind="info" title="Aguardando aprovação da clínica">
          Seu CRM foi aprovado. Assim que um local de atendimento for aprovado, cadastre serviços e horários.
        </Notice>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/medico/horarios" className="card hover:border-primary"><CalendarDays className="mb-1 size-6 text-primary" /><strong>Abrir horários</strong><p className="text-sm text-muted">Gere a agenda da semana</p></Link>
          <Link to="/medico/servicos" className="card hover:border-primary"><Building2 className="mb-1 size-6 text-primary" /><strong>Serviços</strong><p className="text-sm text-muted">Consulta, retorno, teleconsulta</p></Link>
          <Link to="/medico/cadastro" className="card hover:border-primary"><CheckCircle2 className="mb-1 size-6 text-success" /><strong>CRM {pro.profile.crm}/{pro.profile.crmState}</strong><p className="text-sm text-muted">Cadastro aprovado</p></Link>
        </div>
      )}

      {pro.profile && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold">Atendimentos</h2>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtro dos atendimentos">
              {AGENDA_VIEWS.map((item) => (
                <button
                  key={item.value}
                  role="tab"
                  aria-selected={agendaView === item.value}
                  className={`chip ${agendaView === item.value ? 'chip-active' : ''}`}
                  onClick={() => setAgendaView(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {agenda.loading ? (
            <SkeletonCards count={3} lines={3} action label="Carregando atendimentos..." />
          ) : agenda.data?.data.length ? (
            <ul className="space-y-2">
              {agenda.data.data.map((item) => (
                <li key={item.id} className={`card flex flex-wrap items-center gap-3 ${item.id === leavingId ? 'card-leaving' : ''}`}>
                  <div className="w-28 shrink-0">
                    <p className="text-sm text-muted">{dateLong(item.slot.startsAt).split(',')[0]}</p>
                    <p className="text-xl font-black text-primary">{time(item.slot.startsAt)}</p>
                  </div>
                  <SharedPatientAvatar item={item} />
                  <div className="min-w-0 flex-1">
                    <strong>{item.patient.name}</strong>
                    <p className="text-sm text-muted">
                      {item.patient.age} anos · {relationshipLabel[item.patient.relationship] === 'Titular' ? 'titular' : 'dependente'} · {item.serviceNameSnapshot} ({modalityLabel[item.serviceModalitySnapshot]})
                    </p>
                    <p className="text-sm text-muted">{dateLong(item.slot.startsAt)} · {item.clinicNameSnapshot}</p>
                    {item.status === 'CONFIRMED' && (item.attendanceRecordedAt || item.dependentCheckResult === 'CONFIRMED') && <p className="text-sm text-success">Presença registrada</p>}
                  </div>
                  {agendaView !== 'open' ? (
                    <StatusPill tone={item.status === 'COMPLETED' ? 'green' : item.status === 'CONFIRMED' ? 'yellow' : 'gray'}>
                      {appointmentStatusForDoctor(item.status)}
                    </StatusPill>
                  ) : (
                  <div className="flex gap-2">
                    {!item.attendanceRecordedAt && item.dependentCheckResult !== 'CONFIRMED' && Date.now() >= Date.parse(item.slot.startsAt) - 15 * 60000 && Date.now() < Date.parse(item.slot.endsAt) + 30 * 60000 && (
                      <button className="btn btn-secondary" onClick={() => { setError(''); setTarget({ appointment: item, action: 'attendance' }); }}>Registrar presença</button>
                    )}
                    {needsLinkCheck(item) ? (
                      <Tooltip text="Confira o vínculo do dependente antes.">
                        <button className="btn btn-secondary" disabled>Concluir</button>
                      </Tooltip>
                    ) : (
                      <Tooltip text="Marca o atendimento como realizado.">
                        <button className="btn btn-secondary" onClick={() => { setError(''); setTarget({ appointment: item, action: 'complete' }); }}>Concluir</button>
                      </Tooltip>
                    )}
                    <Tooltip align="end" text="Cancela e avisa o paciente.">
                      <button className="btn btn-ghost text-danger" onClick={() => { setError(''); setReason(''); setTarget({ appointment: item, action: 'cancel' }); }}>Cancelar</button>
                    </Tooltip>
                  </div>
                  )}
                  {agendaView === 'open' && <Teleconsultation appointment={item} />}
                  {agendaView !== 'open' && item.cancellationReason && (
                    <p className="w-full text-sm text-muted">Motivo: {item.cancellationReason}</p>
                  )}
                  {agendaView === 'open' && item.patient.guardianName && (
                    item.dependentCheckResult === 'CONFIRMED' ? (
                      <p className="flex w-full items-center gap-1 text-sm text-success">
                        <ShieldCheck className="size-4" aria-hidden /> Vínculo conferido: {relationshipLabel[item.patient.relationship].toLowerCase()} de {item.patient.guardianName}.
                      </p>
                    ) : (
                      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                        <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden />
                        <p className="min-w-0 flex-1">
                          <strong>Dependente</strong> ({relationshipLabel[item.patient.relationship].toLowerCase()} de {item.patient.guardianName}).
                          {' '}Na recepção, confira o documento do responsável e a certidão ou RG do paciente.
                        </p>
                        <span className="flex gap-2">
                          <button className="btn btn-secondary text-sm" onClick={() => { setError(''); setTarget({ appointment: item, action: 'confirmLink' }); }}>
                            Vínculo conferido
                          </button>
                          <button className="btn btn-ghost text-sm text-danger" onClick={() => { setError(''); setReason(''); setTarget({ appointment: item, action: 'mismatch' }); }}>
                            Não confere
                          </button>
                        </span>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarDays className="size-7" />} title={agendaView === 'open' ? 'Nenhum atendimento marcado' : 'Nada por aqui ainda'}>
              {agendaView === 'open' ? 'Quando um paciente agendar, a consulta aparece aqui.' : 'Os atendimentos aparecem aqui depois que passam ou são cancelados.'}
            </EmptyState>
          )}
        </section>
      )}

      <Modal open={Boolean(target)} title={target ? MODAL_TITLES[target.action] : ''} onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-4">
            <p>
              {target.appointment.patient.name}, <span>{dateLong(target.appointment.slot.startsAt)}</span> às {time(target.appointment.slot.startsAt)}.
            </p>
            {target.action === 'attendance' && <Notice kind="info">Confirme somente se o paciente compareceu ao atendimento. Isso evita o cancelamento automático.</Notice>}
            {target.action === 'confirmLink' && (
              <Notice kind="info">
                Confirma que conferiu o documento de <strong>{target.appointment.patient.guardianName}</strong> e o documento de{' '}
                <strong>{target.appointment.patient.name}</strong>, e que o parentesco (
                {relationshipLabel[target.appointment.patient.relationship].toLowerCase()}) confere? Sua confirmação fica registrada.
              </Notice>
            )}
            {target.action === 'mismatch' && (
              <>
                <Notice kind="warning">
                  A consulta será cancelada e a administração do LifeHub receberá um alerta para analisar a conta.
                </Notice>
                <TextArea
                  label="O que você observou (só a administração vê)"
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Notice kind="error" title="Se houver sinais de violência ou risco">
                  Comunique o Conselho Tutelar (obrigatório pelo ECA, art. 13) e ligue para o Disque 100. Em perigo imediato,
                  ligue 190.
                </Notice>
              </>
            )}
            {target.action === 'cancel' && (
              <>
                <Notice kind="warning">O paciente será avisado e o horário ficará livre.</Notice>
                <TextArea label="Motivo (enviado ao paciente)" required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              </>
            )}
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setTarget(null)}>Voltar</button>
              <button
                className={target.action === 'cancel' || target.action === 'mismatch' ? 'btn btn-danger' : 'btn btn-primary'}
                disabled={busy || (target.action === 'cancel' && reason.trim().length < 3)}
                onClick={() => void act()}
              >
                Confirmar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Step({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        {done ? <CheckCircle2 className="size-6 text-success" aria-label="Concluído" /> : <Circle className="size-6 text-muted" aria-label="Pendente" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ProfessionalSetupPage() {
  const { user } = useAuth();
  const pro = useProfessional();
  const specialties = useApi<{ data: Specialty[] }>('/specialties', false);
  const [profileForm, setProfileForm] = useState<{ crm: string; crmState: string; specialtyId: string; bio: string } | null>(null);
  const [clinicForm, setClinicForm] = useState({ cnes: '', cep: '', name: '', address: '', neighborhood: '', city: 'Recife' });
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [editForm, setEditForm] = useState({ cnes: '', cep: '', name: '', address: '', neighborhood: '', city: '' });
  const [editError, setEditError] = useState('');
  const documents = useApi<{ data: { id: string; originalName: string; sizeBytes: number; createdAt: string }[] }>(
    pro.profile ? '/verification/documents' : null,
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const current = profileForm ?? {
    crm: pro.profile?.crm ?? '',
    crmState: pro.profile?.crmState ?? 'PE',
    specialtyId: pro.profile?.specialtyId ?? '',
    bio: pro.profile?.bio ?? '',
  };
  const status = pro.profile?.verificationStatus;
  const canSubmit = Boolean(pro.profile) && (!pro.profile?.verificationSubmittedAt || status === 'CHANGES_REQUESTED');

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      pro.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    const body = { crm: current.crm, crmState: current.crmState, specialtyId: current.specialtyId, bio: current.bio };
    void run(
      () => request('/professionals/me', { method: pro.profile ? 'PATCH' : 'POST', body: jsonBody(body) }),
      'Dados profissionais salvos.',
    ).then(() => setProfileForm(null));
  }

  /** Só o responsável técnico (ou o único médico do local) edita. */
  function canEdit(clinic: Clinic) {
    return clinic.technicalResponsibleProfessionalId
      ? clinic.technicalResponsibleProfessionalId === pro.profile?.id
      : true;
  }

  function openEdit(clinic: Clinic) {
    setEditForm({ cnes: clinic.cnes ?? '', cep: clinic.cep ?? '', name: clinic.name, address: clinic.address, neighborhood: clinic.neighborhood, city: clinic.city });
    setEditError('');
    setEditing(clinic);
  }

  async function saveClinic(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const changes = Object.fromEntries(
      (Object.keys(editForm) as (keyof typeof editForm)[])
        .filter((key) => editForm[key].trim() !== (editing[key] ?? ''))
        .filter((key) => key !== 'cep' || (onlyDigits(editForm.cep).length === 8 && onlyDigits(editForm.cep) !== (editing.cep ?? '')))
        .map((key) => [key, key === 'cnes' || key === 'cep' ? onlyDigits(editForm[key]) : editForm[key].trim()]),
    );
    if (Object.keys(changes).length === 0) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setEditError('');
    try {
      await request(`/clinics/${editing.id}`, { method: 'PATCH', body: jsonBody(changes) });
      setMessage(
        editing.verificationStatus === 'APPROVED'
          ? 'Local atualizado. Ele voltou para análise da administração.'
          : 'Local atualizado.',
      );
      setEditing(null);
      pro.reload();
    } catch (err) {
      setEditError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function createClinic(event: FormEvent) {
    event.preventDefault();
    const cep = onlyDigits(clinicForm.cep);
    const body = { ...clinicForm, cnes: onlyDigits(clinicForm.cnes), cep: cep.length === 8 ? cep : undefined };
    void run(() => request('/clinics', { method: 'POST', body: jsonBody(body) }), 'Local cadastrado. Agora envie o alvará ou um comprovante do local.').then(() =>
      setClinicForm({ cnes: '', cep: '', name: '', address: '', neighborhood: '', city: 'Recife' }),
    );
  }

  /** Alvará ou comprovante do local de atendimento. */
  async function uploadClinicDocument(clinic: Clinic, file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('O arquivo deve ter no máximo 10 MB.');
      return;
    }
    const data = new FormData();
    data.append('file', file);
    await run(
      () => request(`/clinics/${clinic.id}/documents`, { method: 'POST', body: data }),
      `Documento "${file.name}" enviado para ${clinic.name}.`,
    );
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('O arquivo deve ter no máximo 10 MB.');
      return;
    }
    const data = new FormData();
    data.append('file', file);
    await run(() => request('/verification/documents', { method: 'POST', body: data }), `Documento "${file.name}" enviado com segurança.`);
    documents.reload({ quiet: true });
  }

  if (pro.loading) return <SkeletonPage />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Cadastro profissional"
        subtitle="Só médicos com CRM verificado aparecem para os pacientes."
        action={
          status && (
            <StatusPill tone={status === 'PENDING' && !pro.profile?.verificationSubmittedAt ? 'gray' : verificationTone(status)}>
              {professionalStatusLabel(status, pro.profile?.verificationSubmittedAt)}
            </StatusPill>
          )
        }
      />
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {status === 'CHANGES_REQUESTED' && <Notice kind="warning">A equipe pediu correções. Confira suas notificações, ajuste os dados e envie de novo.</Notice>}

      <Step done={Boolean(pro.profile?.crm)} title="1. Foto, CRM e especialidade">
        <ProfilePhoto
          name={user?.name ?? ''}
          photoUrl={pro.profile?.photoUrl ?? null}
          enabled={Boolean(pro.profile)}
          onChanged={() => {
            setMessage('Foto atualizada.');
            pro.reload();
          }}
        />
        <form className="space-y-4" onSubmit={saveProfile}>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Número do CRM" inputMode="numeric" required pattern="\d{4,8}" value={current.crm} onChange={(e) => setProfileForm({ ...current, crm: e.target.value.replace(/\D/g, '') })} />
            <SelectField label="UF" required value={current.crmState} onChange={(e) => setProfileForm({ ...current, crmState: e.target.value })}>
              {UFS.map((uf) => <option key={uf}>{uf}</option>)}
            </SelectField>
          </div>
          <SelectField label="Especialidade" required value={current.specialtyId} onChange={(e) => setProfileForm({ ...current, specialtyId: e.target.value })}>
            <option value="">Selecione</option>
            {specialties.data?.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </SelectField>
          <TextArea label="Apresentação (aparece no seu perfil)" maxLength={600} value={current.bio} onChange={(e) => setProfileForm({ ...current, bio: e.target.value })} />
          {pro.profile?.verificationStatus === 'APPROVED' && <Notice kind="warning">Alterar o CRM exige uma nova análise.</Notice>}
          <button className="btn btn-primary" disabled={busy}>Salvar</button>
        </form>
      </Step>

      <Step done={pro.clinics.length > 0} title="2. Local de atendimento">
        {pro.clinics.length > 0 && (
          <ul className="mb-4 space-y-2">
            {pro.clinics.map((clinic) => (
              <li key={clinic.id} className="flex items-center justify-between gap-2 rounded-xl bg-soft p-3">
                <span>
                  <strong>{clinic.name}</strong>
                  <span className="block text-sm text-muted">{clinic.address}, {clinic.neighborhood}, {clinic.city}</span>
                  {clinic.verificationNote && ['CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'].includes(clinic.verificationStatus) && (
                    <span className="mt-1 block rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-sm">
                      <strong>Recado da administração:</strong> {clinic.verificationNote}
                    </span>
                  )}
                  {clinic.cnes ? (
                    <span className="block text-sm text-muted">CNES {clinic.cnes}</span>
                  ) : (
                    <span className="block text-sm font-semibold text-warning">Sem CNES: edite o local e informe o número.</span>
                  )}
                  {(clinic._count?.documents ?? 0) > 0 ? (
                    <span className="block text-sm text-success">
                      {clinic._count!.documents === 1 ? 'Documento do local enviado' : `${clinic._count!.documents} documentos do local enviados`}
                    </span>
                  ) : (
                    <span className="block text-sm font-semibold text-warning">Falta o alvará ou comprovante do local.</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <StatusPill tone={verificationTone(clinic.verificationStatus)}>{verificationLabel[clinic.verificationStatus]}</StatusPill>
                  {canEdit(clinic) && (
                    <Tooltip align="end" text="Alvará ou comprovante. PDF, JPG ou PNG.">
                      <label className={`btn btn-ghost text-sm ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                        <FileUp className="size-4" /> Documento
                        <input
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          className="sr-only"
                          disabled={busy}
                          onChange={(e) => { void uploadClinicDocument(clinic, e.target.files?.[0]); e.target.value = ''; }}
                        />
                      </label>
                    </Tooltip>
                  )}
                  {canEdit(clinic) ? (
                    <Tooltip align="end" text="Muda nome ou endereço. Volta para análise.">
                      <button type="button" className="btn btn-ghost text-sm" onClick={() => openEdit(clinic)}>
                        <Pencil className="size-4" /> Editar
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip align="end" text="Só o responsável técnico edita este local.">
                      <span tabIndex={0} className="px-2 text-sm text-muted">Compartilhado</span>
                    </Tooltip>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {pro.profile ? (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createClinic}>
            <div className="sm:col-span-2">
              <Field
                label="CNES do local"
                inputMode="numeric"
                required
                maxLength={9}
                value={clinicForm.cnes}
                onChange={(e) => setClinicForm({ ...clinicForm, cnes: e.target.value })}
                hint="Número de 7 dígitos do Cadastro Nacional de Estabelecimentos de Saúde. A administração confere no site do DATASUS."
              />
              <a href="https://cnes.datasus.gov.br/" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline">
                Não sabe o CNES? Consulte em cnes.datasus.gov.br
              </a>
            </div>
            <CepField
              value={clinicForm.cep}
              onChange={(cep) => setClinicForm((form) => ({ ...form, cep }))}
              onFound={(found) => setClinicForm((form) => ({ ...form, ...found }))}
            />
            <Field label="Nome do local" required value={clinicForm.name} onChange={(e) => setClinicForm({ ...clinicForm, name: e.target.value })} />
            <Field label="Endereço" hint="Confira e coloque o número e a sala." required value={clinicForm.address} onChange={(e) => setClinicForm({ ...clinicForm, address: e.target.value })} />
            <Field label="Bairro" required value={clinicForm.neighborhood} onChange={(e) => setClinicForm({ ...clinicForm, neighborhood: e.target.value })} />
            <Field label="Cidade" required value={clinicForm.city} onChange={(e) => setClinicForm({ ...clinicForm, city: e.target.value })} />
            <div className="sm:col-span-2"><button className="btn btn-secondary" disabled={busy}>Adicionar local</button></div>
          </form>
        ) : (
          <p className="text-muted">Conclua a etapa 1 primeiro.</p>
        )}
      </Step>

      <Modal open={Boolean(editing)} title="Editar local de atendimento" onClose={() => setEditing(null)}>
        {editing && (
          <form className="space-y-3" onSubmit={(event) => void saveClinic(event)}>
            {editing.verificationStatus === 'APPROVED' && (
              <Notice kind="warning">
                Mudar o CNES, o nome ou o endereço manda o local de novo para análise. Até a aprovação, ele não aparece na busca e não recebe novos agendamentos.
              </Notice>
            )}
            <Field label="CNES do local" inputMode="numeric" required maxLength={9} value={editForm.cnes} onChange={(e) => setEditForm({ ...editForm, cnes: e.target.value })} hint="7 dígitos, como aparece no site do DATASUS." />
            <CepField
              value={editForm.cep}
              onChange={(cep) => setEditForm((form) => ({ ...form, cep }))}
              onFound={(found) => setEditForm((form) => ({ ...form, ...found }))}
            />
            <Field label="Nome do local" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Field label="Endereço" required value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bairro" required value={editForm.neighborhood} onChange={(e) => setEditForm({ ...editForm, neighborhood: e.target.value })} />
              <Field label="Cidade" required value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
            </div>
            {editError && <Notice kind="error">{editError}</Notice>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy}>Salvar alterações</button>
            </div>
          </form>
        )}
      </Modal>

      <Step done={Boolean(documents.data?.data.length) || Boolean(pro.profile?.verificationSubmittedAt)} title="3. Documentos">
        <p className="mb-3 text-muted">O alvará do local vai pelo botão Documento, na etapa 2. Aqui, envie a carteira do CRM e um documento com foto (PDF, JPG ou PNG, até 10 MB). Os arquivos ficam criptografados e só a equipe de verificação acessa.</p>
        <label className={`btn btn-secondary ${!pro.profile ? 'pointer-events-none opacity-50' : ''}`}>
          <FileUp className="size-5" /> Escolher arquivo
          <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={!pro.profile || busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {documents.data?.data.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {documents.data.data.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 truncate">{doc.originalName}</span>
                <span className="shrink-0 text-muted">· {Math.ceil(doc.sizeBytes / 1024)} KB · {dateLong(doc.createdAt).split(',')[0]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Step>

      <Step done={Boolean(pro.profile?.verificationSubmittedAt) && status !== 'CHANGES_REQUESTED'} title="4. Enviar para análise">
        {pro.profile?.verificationSubmittedAt && status === 'PENDING' ? (
          <Notice kind="info">Enviado. A análise costuma ser feita em até 2 dias úteis.</Notice>
        ) : status === 'APPROVED' ? (
          <Notice kind="success">Cadastro aprovado. Você já aparece na busca quando tiver horários abertos.</Notice>
        ) : (
          <button className="btn btn-primary" disabled={!canSubmit || busy} onClick={() => void run(() => request('/verification/submit', { method: 'POST' }), 'Cadastro enviado para análise.')}>
            <Send className="size-5" /> Enviar para análise
          </button>
        )}
      </Step>
    </div>
  );
}

export function useServices(clinicId: string) {
  return useApi<{ data: import('../../lib/types').ServiceItem[] }>(clinicId ? `/clinics/${clinicId}/services` : null);
}

export function ClinicPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const pro = useProfessional();
  const approved = useMemo(() => pro.clinics.filter((clinic) => clinic.verificationStatus === 'APPROVED'), [pro.clinics]);
  useEffect(() => {
    if (!value && approved[0]) onChange(approved[0].id);
  }, [approved, value, onChange]);
  if (pro.loading) return <SkeletonPage />;
  if (!approved.length) {
    return <Notice kind="info">Nenhum local aprovado ainda. <Link to="/medico/cadastro" className="font-semibold underline">Ver cadastro</Link></Notice>;
  }
  return (
    <SelectField label="Local de atendimento" value={value} onChange={(e) => onChange(e.target.value)}>
      {approved.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name} — {clinic.neighborhood}</option>)}
    </SelectField>
  );
}

type CepResult = { address?: string; neighborhood?: string; city?: string };

/**
 * CEP com preenchimento automático pelo ViaCEP. Se a consulta falhar
 * (sem internet, CEP inexistente), o médico preenche o endereço à mão.
 */
function CepField({ value, onChange, onFound }: { value: string; onChange: (cep: string) => void; onFound: (found: CepResult) => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'found' | 'notFound' | 'offline'>('idle');

  async function lookup(cep: string) {
    setState('loading');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      const data = (await response.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string };
      if (!response.ok || data.erro) {
        setState('notFound');
        return;
      }
      const found: CepResult = {};
      if (data.logradouro) found.address = `${data.logradouro}, `;
      if (data.bairro) found.neighborhood = data.bairro;
      if (data.localidade) found.city = data.localidade;
      onFound(found);
      setState('found');
    } catch {
      setState('offline');
    } finally {
      window.clearTimeout(timer);
    }
  }

  const hint = {
    idle: 'Digite o CEP para preencher o endereço.',
    loading: 'Buscando endereço…',
    found: 'Endereço preenchido. Complete com o número.',
    notFound: 'CEP não encontrado. Preencha o endereço à mão.',
    offline: 'Não deu para consultar o CEP agora. Preencha à mão.',
  }[state];

  return (
    <Field
      label="CEP"
      inputMode="numeric"
      autoComplete="postal-code"
      maxLength={9}
      placeholder="00000-000"
      value={value}
      hint={hint}
      onChange={(e) => {
        const digits = onlyDigits(e.target.value).slice(0, 8);
        onChange(digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits);
        if (digits.length === 8) void lookup(digits);
        else setState('idle');
      }}
    />
  );
}
