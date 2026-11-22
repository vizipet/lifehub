import { type FormEvent, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Lock,
  Megaphone,
  Search,
  ShieldAlert,
  Unlock,
  UserRound,
  Users,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchBlob, jsonBody, messageOf, request, type Paginated } from '../../api';
import { dateShort, dateTime, relationshipLabel, verificationLabel } from '../../lib/format';
import type { Campaign, Relationship, VerificationStatus } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { Avatar, Checkbox, EmptyState, Field, Modal, Notice, PageHeader, SelectField, SkeletonCards, SkeletonStats, StatusPill, TextArea } from '../../ui/kit';
import { verificationTone } from '../professional/ProfessionalPages';

interface Overview {
  patients: number;
  professionals: number;
  pendingProfessionals: number;
  pendingClinics: number;
  upcomingAppointments: number;
  appointmentsLast30: number;
  publishedCampaigns: number;
  blockedUsers: number;
  openSafetyAlerts: number;
}

export function AdminOverviewPage() {
  const overview = useApi<{ data: Overview }>('/admin/overview');
  const data = overview.data?.data;
  const cards = data
    ? [
        { label: 'Pacientes ativos', value: data.patients, icon: Users },
        { label: 'Médicos aprovados', value: data.professionals, icon: UserRound },
        { label: 'Consultas futuras', value: data.upcomingAppointments, icon: CalendarCheck },
        { label: 'Agendamentos (30 dias)', value: data.appointmentsLast30, icon: CalendarCheck },
        { label: 'Campanhas publicadas', value: data.publishedCampaigns, icon: Megaphone },
        { label: 'Contas bloqueadas', value: data.blockedUsers, icon: Lock },
      ]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Visão geral" subtitle="Situação da plataforma agora." />
      {overview.error && <Notice kind="error">{overview.error}</Notice>}
      {overview.loading || !data ? (
        <SkeletonStats />
      ) : (
        <>
          {data.openSafetyAlerts > 0 && (
            <Link to="/admin/alertas" className="card flex items-center gap-3 border-danger/40 hover:border-primary">
              <ShieldAlert className="size-7 text-danger" />
              <div>
                <strong>{data.openSafetyAlerts} alerta(s) de dependentes</strong>
                <p className="text-sm text-muted">Vínculo não conferido, CPF em outra conta ou muitas crianças cadastradas</p>
              </div>
            </Link>
          )}
          {(data.pendingProfessionals > 0 || data.pendingClinics > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/admin/medicos" className="card flex items-center gap-3 border-warning/40 hover:border-primary">
                <ClipboardCheck className="size-7 text-warning" />
                <div><strong>{data.pendingProfessionals} médico(s) aguardando análise</strong><p className="text-sm text-muted">Conferir CRM e documentos</p></div>
              </Link>
              <Link to="/admin/clinicas" className="card flex items-center gap-3 border-warning/40 hover:border-primary">
                <Building2 className="size-7 text-warning" />
                <div><strong>{data.pendingClinics} clínica(s) pendente(s)</strong><p className="text-sm text-muted">Aprovar locais de atendimento</p></div>
              </Link>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {cards.map((card) => (
              <div key={card.label} className="card">
                <card.icon className="mb-1 size-5 text-primary" aria-hidden />
                <p className="text-3xl font-black">{card.value}</p>
                <p className="text-sm text-muted">{card.label}</p>
              </div>
            ))}
          </div>
          <Link to="/admin/auditoria" className="btn btn-secondary">Ver registro de auditoria</Link>
        </>
      )}
    </div>
  );
}

interface PendingProfessional {
  id: string;
  crm: string | null;
  crmState: string | null;
  specialty: { name: string } | null;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt: string;
  user: { id: string; name: string };
  photoUrl: string | null;
}

interface VerificationDoc {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function AdminProfessionalsPage() {
  const queue = useApi<Paginated<PendingProfessional>>('/admin/verifications/professionals');
  const [selected, setSelected] = useState<PendingProfessional | null>(null);
  const docs = useApi<Paginated<VerificationDoc>>(selected ? `/admin/verifications/professionals/${selected.id}/documents` : null);
  const [decision, setDecision] = useState<'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED'>('APPROVED');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function openDocument(doc: VerificationDoc) {
    setError('');
    try {
      // Acesso temporário (60 s) e registrado na auditoria.
      const { data } = await request<{ data: { url: string } }>(`/admin/verifications/documents/${doc.id}/access`, { method: 'POST' });
      const blob = await fetchBlob(data.url.replace(/^\/api\/v1/, ''));
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await request(`/admin/verifications/professionals/${selected.id}/decisions`, {
        method: 'POST',
        body: jsonBody({ decision, reason, expectedSubmittedAt: selected.verificationSubmittedAt }),
      });
      setMessage(`Decisão registrada: ${selected.user.name} — ${verificationLabel[decision]}.`);
      setSelected(null);
      setReason('');
      queue.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Verificação de médicos" subtitle="Confira o CRM no portal do CFM e os documentos antes de aprovar." />
      {message && <div className="mb-3"><Notice kind="success">{message}</Notice></div>}
      {queue.loading ? (
        <SkeletonCards count={3} lines={2} action label="Carregando fila de médicos..." />
      ) : queue.data?.data.length ? (
        <ul className="space-y-2">
          {queue.data.data.map((item) => (
            <li key={item.id} className="card flex flex-wrap items-center gap-3">
              <Avatar name={item.user.name} photoUrl={item.photoUrl} />
              <div className="flex-1">
                <strong>{item.user.name}</strong>
                <p className="text-sm text-muted">{item.specialty?.name ?? 'Sem especialidade'} · CRM {item.crm}/{item.crmState} · enviado em {dateShort(item.verificationSubmittedAt)}</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setSelected(item); setError(''); setDecision('APPROVED'); setReason(''); }}>Analisar</button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ClipboardCheck className="size-7" />} title="Fila vazia">Nenhum médico aguardando análise.</EmptyState>
      )}

      <Modal open={Boolean(selected)} title={`Analisar ${selected?.user.name ?? ''}`} onClose={() => setSelected(null)}>
        {selected && (
          <form className="space-y-4" onSubmit={(e) => void decide(e)}>
            <dl className="grid grid-cols-2 gap-2 rounded-xl bg-soft p-3 text-sm">
              <div><dt className="text-muted">CRM</dt><dd className="font-semibold">{selected.crm}/{selected.crmState}</dd></div>
              <div><dt className="text-muted">Especialidade</dt><dd className="font-semibold">{selected.specialty?.name}</dd></div>
            </dl>
            <div>
              <h3 className="mb-2 font-bold">Documentos</h3>
              {docs.loading ? <SkeletonCards count={2} lines={1} label="Carregando documentos..." /> : (
                <ul className="space-y-1">
                  {docs.data?.data.map((doc) => (
                    <li key={doc.id}>
                      <button type="button" className="btn btn-secondary w-full justify-start text-sm" onClick={() => void openDocument(doc)}>
                        <FileText className="size-4" /> {doc.originalName} ({Math.ceil(doc.sizeBytes / 1024)} KB)
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted">Cada abertura fica registrada na auditoria.</p>
            </div>
            <SelectField label="Decisão" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
              <option value="APPROVED">Aprovar</option>
              <option value="CHANGES_REQUESTED">Pedir correção</option>
              <option value="REJECTED">Rejeitar</option>
            </SelectField>
            <TextArea label="Justificativa (o médico recebe esta mensagem)" required maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>Cancelar</button>
              <button className={decision === 'APPROVED' ? 'btn btn-primary' : 'btn btn-danger'} disabled={busy || !reason.trim()}>
                {decision === 'APPROVED' ? 'Confirmar aprovação' : decision === 'REJECTED' ? 'Confirmar rejeição' : 'Pedir correção'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

interface AdminClinic {
  id: string;
  cnes: string | null;
  cep: string | null;
  name: string;
  address: string;
  neighborhood: string;
  city: string;
  verificationStatus: VerificationStatus;
  createdAt: string;
  documents: { id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string }[];
  professionals: { id: string; name: string; crm: string | null; crmState: string | null; verificationStatus: VerificationStatus }[];
}

export function AdminClinicsPage() {
  const [status, setStatus] = useState<VerificationStatus>('PENDING');
  const list = useApi<Paginated<AdminClinic>>(`/admin/clinics?status=${status}`);
  const [target, setTarget] = useState<{ clinic: AdminClinic; decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'SUSPENDED' } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checklist, setChecklist] = useState({ cnesChecked: false, addressMatches: false, professionalListed: false, documentChecked: false });
  const [copied, setCopied] = useState(false);

  function open(clinic: AdminClinic, decision: NonNullable<typeof target>['decision']) {
    setReason('');
    setError('');
    setCopied(false);
    setChecklist({ cnesChecked: false, addressMatches: false, professionalListed: false, documentChecked: false });
    setTarget({ clinic, decision });
  }

  /** Copia o CNES e abre o site oficial para o admin colar na consulta. */
  async function checkCnes(cnes: string) {
    try {
      await navigator.clipboard.writeText(cnes);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open('https://cnes.datasus.gov.br/', '_blank', 'noopener');
  }

  const approving = target?.decision === 'APPROVED';
  const allChecked = checklist.cnesChecked && checklist.addressMatches && checklist.professionalListed && checklist.documentChecked;

  /** Abre o alvará/comprovante. Cada abertura fica registrada na auditoria. */
  async function openClinicDocument(id: string) {
    setError('');
    try {
      const blob = await fetchBlob(`/admin/clinic-documents/${id}/content`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function ClinicDocuments({ clinic }: { clinic: AdminClinic }) {
    if (!clinic.documents.length) {
      return <p className="text-sm font-semibold text-warning">Sem alvará ou comprovante enviado</p>;
    }
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-sm">
        <span>Documentos:</span>
        {clinic.documents.map((doc) => (
          <button key={doc.id} type="button" className="inline-flex items-center gap-1 font-semibold text-primary underline" onClick={() => void openClinicDocument(doc.id)}>
            <FileText className="size-4" /> {doc.originalName} ({Math.ceil(doc.sizeBytes / 1024)} KB)
          </button>
        ))}
      </p>
    );
  }

  async function decide() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await request(`/admin/clinics/${target.clinic.id}/decision`, {
        method: 'PATCH',
        body: jsonBody({ decision: target.decision, ...(reason ? { reason } : {}), ...(approving ? { checklist } : {}) }),
      });
      setTarget(null);
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Clínicas e locais" subtitle="Só locais aprovados recebem agendamentos." />
      <div className="mb-4 flex flex-wrap gap-2">
        {(['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'] as VerificationStatus[]).map((value) => (
          <button key={value} className={`chip ${status === value ? 'chip-active' : ''}`} aria-pressed={status === value} onClick={() => setStatus(value)}>
            {verificationLabel[value]}
          </button>
        ))}
      </div>
      {list.loading ? (
        <SkeletonCards count={3} lines={4} action label="Carregando locais..." />
      ) : list.data?.data.length ? (
        <ul className="space-y-2">
          {list.data.data.map((clinic) => (
            <li key={clinic.id} className="card">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1">
                  <strong>{clinic.name}</strong> <StatusPill tone={verificationTone(clinic.verificationStatus)}>{verificationLabel[clinic.verificationStatus]}</StatusPill>
                  <p className="text-sm text-muted">
                    {clinic.address}, {clinic.neighborhood}, {clinic.city}
                    {clinic.cep && ` · CEP ${clinic.cep.slice(0, 5)}-${clinic.cep.slice(5)}`}
                  </p>
                  <p className="text-sm">
                    {clinic.cnes ? (
                      <>CNES <strong>{clinic.cnes}</strong>{' '}
                        <button type="button" className="font-semibold text-primary underline" onClick={() => void checkCnes(clinic.cnes!)}>
                          Conferir no DATASUS
                        </button>
                      </>
                    ) : (
                      <span className="font-semibold text-warning">Sem CNES informado</span>
                    )}
                  </p>
                  <ClinicDocuments clinic={clinic} />
                  <p className="text-sm">Médicos: {clinic.professionals.map((p) => `${p.name} (CRM ${p.crm}/${p.crmState}, ${verificationLabel[p.verificationStatus].toLowerCase()})`).join('; ') || '—'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {clinic.verificationStatus !== 'APPROVED' && <button className="btn btn-primary" onClick={() => open(clinic, 'APPROVED')}>Aprovar</button>}
                  {clinic.verificationStatus === 'PENDING' && <button className="btn btn-secondary" onClick={() => open(clinic, 'CHANGES_REQUESTED')}>Pedir correção</button>}
                  {clinic.verificationStatus === 'APPROVED' ? (
                    <button className="btn btn-ghost text-danger" onClick={() => open(clinic, 'SUSPENDED')}>Suspender</button>
                  ) : (
                    clinic.verificationStatus !== 'REJECTED' && <button className="btn btn-ghost text-danger" onClick={() => open(clinic, 'REJECTED')}>Rejeitar</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Building2 className="size-7" />} title="Nenhuma clínica nesta situação" />
      )}

      <Modal open={Boolean(target)} title="Confirmar decisão" onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-4">
            <p><strong>{target.clinic.name}</strong> → {verificationLabel[target.decision]}</p>
            {approving && (
              target.clinic.cnes ? (
                <fieldset className="space-y-1 rounded-lg border border-line p-3">
                  <legend className="px-1 font-bold">Conferência no CNES</legend>
                  <p className="text-sm text-muted">
                    CNES {target.clinic.cnes}.{' '}
                    <button type="button" className="font-semibold text-primary underline" onClick={() => void checkCnes(target.clinic.cnes!)}>
                      Copiar e abrir o DATASUS
                    </button>
                    {copied && <span className="text-success"> Número copiado.</span>}
                  </p>
                  <Checkbox checked={checklist.cnesChecked} onChange={(value) => setChecklist({ ...checklist, cnesChecked: value })}>
                    O CNES existe e está ativo.
                  </Checkbox>
                  <Checkbox checked={checklist.addressMatches} onChange={(value) => setChecklist({ ...checklist, addressMatches: value })}>
                    O nome e o endereço batem com o cadastro do CNES.
                  </Checkbox>
                  <Checkbox checked={checklist.professionalListed} onChange={(value) => setChecklist({ ...checklist, professionalListed: value })}>
                    O médico responsável aparece entre os profissionais do local.
                  </Checkbox>
                  <div className="border-t border-line pt-2">
                    <ClinicDocuments clinic={target.clinic} />
                  </div>
                  <Checkbox
                    checked={checklist.documentChecked}
                    onChange={(value) => setChecklist({ ...checklist, documentChecked: value })}
                  >
                    Abri o documento e ele é do mesmo local (nome, endereço, CNPJ).
                  </Checkbox>
                </fieldset>
              ) : (
                <Notice kind="warning">Este local não tem CNES. Peça correção ao médico antes de aprovar.</Notice>
              )
            )}
            {approving && target.clinic.cnes && !target.clinic.documents.length && (
              <Notice kind="warning">Sem alvará ou comprovante. Peça correção ao médico antes de aprovar.</Notice>
            )}
            <TextArea label={target.decision === 'APPROVED' ? 'Observação (opcional)' : 'Motivo'} required={target.decision !== 'APPROVED'} value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setTarget(null)}>Cancelar</button>
              <button
                className={approving ? 'btn btn-primary' : 'btn btn-danger'}
                disabled={busy || (approving ? !allChecked || !target.clinic.cnes || !target.clinic.documents.length : !reason.trim())}
                onClick={() => void decide()}
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

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'PATIENT' | 'PROFESSIONAL' | 'ADMIN';
  status: 'ACTIVE' | 'BLOCKED';
  cpfMasked: string | null;
  createdAt: string;
  professionalProfile: { verificationStatus: VerificationStatus; crm: string | null; crmState: string | null } | null;
}

const ROLE_LABEL = { PATIENT: 'Paciente', PROFESSIONAL: 'Médico', ADMIN: 'Administração' } as const;

export function AdminUsersPage() {
  const [filters, setFilters] = useState({ q: '', role: '', status: '' });
  const [applied, setApplied] = useState(filters);
  const query = new URLSearchParams(Object.entries(applied).filter(([, v]) => v) as [string, string][]);
  const list = useApi<Paginated<AdminUser>>(`/admin/users?${query}`);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  async function toggle() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      const blocking = target.status === 'ACTIVE';
      const { data } = await request<{ data: { cancelledAppointments: number } }>(`/admin/users/${target.id}/status`, {
        method: 'PATCH',
        body: jsonBody({ status: blocking ? 'BLOCKED' : 'ACTIVE', reason }),
      });
      const cancelled = data.cancelledAppointments;
      setDone(
        blocking
          ? `${target.name} foi bloqueado(a).` +
              (cancelled ? ` ${cancelled} consulta${cancelled > 1 ? 's foram canceladas' : ' foi cancelada'} e o outro lado foi avisado.` : '')
          : `${target.name} foi desbloqueado(a).`,
      );
      setTarget(null);
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Usuários" subtitle="CPF sempre mascarado. Para achar por CPF, digite os 11 números." />
      <form className="card mb-4 grid gap-3 md:grid-cols-[1fr_12rem_12rem_auto]" onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}>
        <Field label="Nome, e-mail ou CPF" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <SelectField label="Perfil" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">Todos</option><option value="PATIENT">Pacientes</option><option value="PROFESSIONAL">Médicos</option><option value="ADMIN">Administração</option>
        </SelectField>
        <SelectField label="Situação" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Todas</option><option value="ACTIVE">Ativos</option><option value="BLOCKED">Bloqueados</option>
        </SelectField>
        <button className="btn btn-primary self-end"><Search className="size-5" /> Filtrar</button>
      </form>
      {list.error && <Notice kind="error">{list.error}</Notice>}
      {done && <div className="mb-3"><Notice kind="success">{done}</Notice></div>}
      {list.loading ? (
        <SkeletonCards count={6} lines={1} action label="Carregando usuários..." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-soft text-muted">
              <tr><th className="p-3">Nome</th><th className="p-3">Perfil</th><th className="p-3">CPF</th><th className="p-3">Desde</th><th className="p-3">Situação</th><th className="p-3"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {list.data?.data.map((user) => (
                <tr key={user.id} className="border-t border-line">
                  <td className="p-3"><strong>{user.name}</strong><span className="block text-muted">{user.email}</span></td>
                  <td className="p-3">{ROLE_LABEL[user.role]}{user.professionalProfile?.crm && <span className="block text-muted">CRM {user.professionalProfile.crm}/{user.professionalProfile.crmState}</span>}</td>
                  <td className="p-3">{user.cpfMasked}</td>
                  <td className="p-3">{dateShort(user.createdAt)}</td>
                  <td className="p-3"><StatusPill tone={user.status === 'ACTIVE' ? 'green' : 'red'}>{user.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}</StatusPill></td>
                  <td className="p-3 text-right">
                    {user.role === 'PROFESSIONAL' && (
                      <Link
                        to={`/admin/auditoria?pessoa=${user.id}&nome=${encodeURIComponent(user.name)}`}
                        className="btn btn-ghost text-sm"
                      >
                        <FileText className="size-4" /> Histórico
                      </Link>
                    )}
                    {user.role !== 'ADMIN' && (
                      <button className={`btn ${user.status === 'ACTIVE' ? 'btn-ghost text-danger' : 'btn-secondary'} text-sm`} onClick={() => { setReason(''); setError(''); setTarget(user); }}>
                        {user.status === 'ACTIVE' ? <><Lock className="size-4" /> Bloquear</> : <><Unlock className="size-4" /> Desbloquear</>}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data?.data.length === 0 && <p className="p-4 text-center text-muted">Nenhum usuário encontrado.</p>}
        </div>
      )}

      <Modal open={Boolean(target)} title={target?.status === 'ACTIVE' ? 'Bloquear usuário' : 'Desbloquear usuário'} onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-4">
            {target.status === 'ACTIVE' && (
              <Notice kind="warning">
                {target.name} perde o acesso na hora: todas as sessões são encerradas.{' '}
                {target.role === 'PROFESSIONAL'
                  ? 'As consultas futuras com este médico são canceladas e os pacientes, avisados.'
                  : 'As consultas futuras desta conta (e dos dependentes) são canceladas e os médicos, avisados.'}
              </Notice>
            )}
            <TextArea label="Motivo (fica na auditoria)" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setTarget(null)}>Cancelar</button>
              <button className={target.status === 'ACTIVE' ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy || reason.trim().length < 3} onClick={() => void toggle()}>Confirmar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

const CAMPAIGN_STATUS: Record<string, string> = { DRAFT: 'Rascunho', UNDER_REVIEW: 'Em revisão', PUBLISHED: 'Publicada', ENDED: 'Encerrada', ARCHIVED: 'Arquivada' };

export function AdminCampaignsPage() {
  const list = useApi<{ data: Campaign[] }>('/campaigns/admin');
  const empty = { title: '', type: 'VACINACAO', agency: '', targetAudience: '', requirements: '', location: '', startsAt: '', endsAt: '', sourceUrl: 'https://www.gov.br/saude/pt-br' };
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [archiving, setArchiving] = useState<Campaign | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Recife' });

  function startEdit(campaign: Campaign) {
    setError('');
    setEditing(campaign);
    setForm({
      title: campaign.title,
      type: campaign.type,
      agency: campaign.agency,
      targetAudience: campaign.targetAudience,
      requirements: campaign.requirements,
      location: campaign.location,
      startsAt: dayOf(campaign.startsAt),
      endsAt: dayOf(campaign.endsAt),
      sourceUrl: campaign.sourceUrl,
    });
    setOpen(true);
  }

  async function act(path: string, method: 'PATCH' | 'DELETE' = 'PATCH') {
    setError('');
    try {
      await request(path, { method });
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await request<{ data: { possibleDuplicate?: boolean } }>(editing ? `/campaigns/admin/${editing.id}` : '/campaigns', {
        method: editing ? 'PATCH' : 'POST',
        body: jsonBody({ ...form, startsAt: new Date(`${form.startsAt}T00:00:00-03:00`).toISOString(), endsAt: new Date(`${form.endsAt}T23:59:00-03:00`).toISOString() }),
      });
      setWarning(
        response.data.possibleDuplicate
          ? 'Rascunho salvo, mas já existe uma campanha com o mesmo título e órgão no mesmo período. Confira se não é repetida.'
          : '',
      );
      setOpen(false);
      setEditing(null);
      setForm(empty);
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Campanhas" subtitle="Rascunho → revisão → publicação. Toda campanha precisa de fonte oficial." action={<button className="btn btn-primary" onClick={() => { setError(''); setEditing(null); setForm(empty); setOpen(true); }}>Nova campanha</button>} />
      {error && <div className="mb-3"><Notice kind="error">{error}</Notice></div>}
      {warning && <div className="mb-3"><Notice kind="warning">{warning}</Notice></div>}
      {list.loading ? (
        <SkeletonCards count={3} lines={3} action label="Carregando campanhas..." />
      ) : list.data?.data.length ? (
        <ul className="space-y-2">
          {list.data.data.map((campaign) => (
            <li key={campaign.id} className="card flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <strong>{campaign.title}</strong> <StatusPill tone={campaign.status === 'PUBLISHED' ? 'green' : campaign.status === 'UNDER_REVIEW' ? 'yellow' : 'gray'}>{CAMPAIGN_STATUS[campaign.status ?? ''] ?? campaign.status}</StatusPill>
                <p className="text-sm text-muted">{campaign.agency} · {dateShort(campaign.startsAt)} a {dateShort(campaign.endsAt)}</p>
              </div>
              {campaign.status === 'DRAFT' && <button className="btn btn-secondary" onClick={() => void act(`/campaigns/admin/${campaign.id}/review`)}>Enviar para revisão</button>}
              {campaign.status === 'UNDER_REVIEW' && <button className="btn btn-primary" onClick={() => void act(`/campaigns/admin/${campaign.id}/publish`)}>Publicar</button>}
              {campaign.status !== 'ARCHIVED' && <button className="btn btn-secondary" onClick={() => startEdit(campaign)}>Editar</button>}
              {campaign.status !== 'ARCHIVED' && <button className="btn btn-ghost text-danger" onClick={() => setArchiving(campaign)}>Arquivar</button>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Megaphone className="size-7" />} title="Nenhuma campanha" />
      )}

      <Modal open={Boolean(archiving)} title="Arquivar campanha" onClose={() => setArchiving(null)}>
        {archiving && (
          <div className="space-y-4">
            <p>
              <strong>{archiving.title}</strong> sai da lista dos pacientes e não pode mais ser editada nem publicada de novo.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setArchiving(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  const id = archiving.id;
                  setArchiving(null);
                  void act(`/campaigns/admin/${id}`, 'DELETE');
                }}
              >
                Arquivar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} title={editing ? 'Editar campanha' : 'Nova campanha'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={(e) => void create(e)}>
          {editing && editing.status !== 'DRAFT' && (
            <Notice kind="info">Ao salvar, a campanha volta para rascunho e precisa passar pela revisão de novo antes de aparecer para os pacientes.</Notice>
          )}
          <Field label="Título" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="VACINACAO">Vacinação</option><option value="PREVENCAO">Prevenção</option>
            </SelectField>
            <Field label="Órgão responsável" required value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
          </div>
          <TextArea label="Público" required value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} />
          <Field label="O que levar" required value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
          <Field label="Local" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" type="date" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
            <Field label="Fim" type="date" required min={form.startsAt} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </div>
          <Field label="Link da fonte oficial (https)" type="url" required value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy}>{editing ? 'Salvar alterações' : 'Salvar rascunho'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface AuditRow {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  reason: string | null;
  summary: string[];
  createdAt: string;
  actorId: string;
  actorName: string;
  actorRole: 'PATIENT' | 'PROFESSIONAL' | 'ADMIN';
  actorCrm: string | null;
}

interface AuditAction {
  code: string;
  label: string;
  scope: 'PROFESSIONAL' | 'ADMIN';
}

const DESTRUCTIVE = ['SERVICE_DELETED', 'SERVICE_DEACTIVATED', 'APPOINTMENT_CANCELLED_BY_PROFESSIONAL', 'SLOT_BLOCKED', 'USER_BLOCKED', 'PROFESSIONAL_CRM_CHANGED'];

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const actorId = params.get('pessoa') ?? '';
  const actorName = params.get('nome') ?? '';
  const scope = params.get('perfil') ?? '';
  const action = params.get('acao') ?? '';
  const page = Number(params.get('pagina') ?? '1');

  const query = new URLSearchParams({ page: String(page), limit: '25' });
  if (actorId) query.set('actorId', actorId);
  if (scope) query.set('scope', scope);
  if (action) query.set('action', action);
  const list = useApi<Paginated<AuditRow>>(`/admin/audit?${query}`);
  const actions = useApi<{ data: AuditAction[] }>('/admin/audit/actions');

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('pagina' in changes)) next.delete('pagina');
    setParams(next);
  }

  const availableActions = (actions.data?.data ?? []).filter((item) => !scope || item.scope === scope);

  return (
    <div>
      <PageHeader
        title="Auditoria"
        subtitle={actorId ? `Tudo o que ${actorName || 'esta pessoa'} fez na plataforma.` : 'Quem fez o quê, e quando. Os registros não podem ser apagados.'}
      />

      <div className="card mb-4 space-y-3">
        {actorId && (
          <p className="flex flex-wrap items-center gap-2">
            <span>Mostrando só: <strong>{actorName || 'pessoa selecionada'}</strong></span>
            <button className="btn btn-ghost min-h-9 text-sm" onClick={() => update({ pessoa: '', nome: '' })}>Ver todos</button>
          </p>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quem fez">
          {[
            ['', 'Todos'],
            ['PROFESSIONAL', 'Médicos'],
            ['ADMIN', 'Administração'],
          ].map(([value, label]) => (
            <button key={value || 'todos'} className={`chip ${scope === value ? 'chip-active' : ''}`} aria-pressed={scope === value} onClick={() => update({ perfil: value, acao: '' })}>
              {label}
            </button>
          ))}
        </div>
        <SelectField label="Tipo de ação" value={action} onChange={(e) => update({ acao: e.target.value })}>
          <option value="">Todas</option>
          {availableActions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </SelectField>
      </div>

      {list.error && <Notice kind="error">{list.error}</Notice>}
      {list.loading ? (
        <SkeletonCards count={6} lines={2} label="Carregando auditoria..." />
      ) : list.data?.data.length ? (
        <>
          <p className="mb-2 text-muted">{list.data.meta.total} registro(s)</p>
          <ol className="space-y-2">
            {list.data.data.map((row) => (
              <li key={row.id} className={`card flex gap-3 ${DESTRUCTIVE.includes(row.action) ? 'border-l-4 border-l-pitanga' : ''}`}>
                <ShieldAlert className={`mt-1 size-5 shrink-0 ${DESTRUCTIVE.includes(row.action) ? 'text-pitanga' : 'text-primary'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <strong className="text-lg">{row.actionLabel}</strong>
                    <time className="text-sm text-muted">{dateTime(row.createdAt)}</time>
                  </div>
                  <p className="text-muted">
                    {row.actorRole === 'PROFESSIONAL' ? 'Médico' : row.actorRole === 'ADMIN' ? 'Administração' : 'Paciente'}:{' '}
                    {actorId ? (
                      <span className="font-semibold text-ink">{row.actorName}</span>
                    ) : (
                      <button className="font-semibold text-primary underline underline-offset-2" onClick={() => update({ pessoa: row.actorId, nome: row.actorName })}>
                        {row.actorName}
                      </button>
                    )}
                    {row.actorCrm && <span>, CRM {row.actorCrm}</span>}
                  </p>
                  {row.summary.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {row.summary.map((line, index) => <li key={index}>{line}</li>)}
                    </ul>
                  )}
                  {row.reason && <p className="mt-1">Motivo: {row.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
          <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Páginas">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => update({ pagina: String(page - 1) })}>Anterior</button>
            <span className="text-sm text-muted">Página {page} de {list.data.meta.totalPages || 1}</span>
            <button className="btn btn-secondary" disabled={page >= list.data.meta.totalPages} onClick={() => update({ pagina: String(page + 1) })}>Próxima</button>
          </nav>
        </>
      ) : (
        <EmptyState icon={<ShieldAlert className="size-7" />} title="Nenhum registro com esses filtros" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alertas de dependentes
// ---------------------------------------------------------------------------

type SafetyAlertKind = 'LINK_MISMATCH' | 'DUPLICATE_CPF' | 'MANY_MINORS';

interface SafetyAlert {
  id: string;
  kind: SafetyAlertKind;
  status: 'OPEN' | 'RESOLVED';
  details: {
    relationship?: Relationship;
    note?: string;
    professionalName?: string;
    clinicName?: string;
    startsAt?: string;
    hasOwnAccount?: boolean;
    count?: number;
    hours?: number;
  };
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  holder: { id: string; name: string; email: string; status: 'ACTIVE' | 'BLOCKED' | 'DELETED' };
  patient: { name: string; relationship: Relationship; age: number } | null;
  otherHolders: { id: string; name: string }[];
}

const ALERT_TITLE: Record<SafetyAlertKind, string> = {
  LINK_MISMATCH: 'Vínculo não conferiu no atendimento',
  DUPLICATE_CPF: 'CPF de dependente em outra conta',
  MANY_MINORS: 'Muitas crianças cadastradas em pouco tempo',
};

function AlertBody({ alert }: { alert: SafetyAlert }) {
  const d = alert.details;
  const patient = alert.patient;
  const who = patient ? `${patient.name}, ${patient.age} anos (${relationshipLabel[patient.relationship].toLowerCase()})` : '';
  if (alert.kind === 'LINK_MISMATCH') {
    return (
      <>
        <p>{who}</p>
        <p className="text-muted">
          {d.professionalName} · {d.clinicName}
          {d.startsAt && ` · consulta de ${dateTime(d.startsAt)}`}
        </p>
        {d.note && <p className="mt-1 rounded-lg bg-soft p-2">"{d.note}"</p>}
      </>
    );
  }
  if (alert.kind === 'DUPLICATE_CPF') {
    return (
      <>
        <p>{who}</p>
        <p className="text-muted">
          O mesmo CPF já está em: {[
            ...alert.otherHolders.map((other) => `conta de ${other.name}`),
            ...(d.hasOwnAccount ? ['uma conta própria (a pessoa tem cadastro no LifeHub)'] : []),
          ].join('; ')}.
          {' '}Pode ser pai e mãe com contas separadas. Confira com os titulares.
        </p>
      </>
    );
  }
  return (
    <p className="text-muted">
      {d.count} crianças cadastradas nas últimas {d.hours} horas (contando as que foram removidas).
    </p>
  );
}

export function AdminSafetyAlertsPage() {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const list = useApi<Paginated<SafetyAlert>>(`/admin/safety-alerts?status=${status}`);
  const [target, setTarget] = useState<SafetyAlert | null>(null);
  const [resolution, setResolution] = useState('');
  const [block, setBlock] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function open(alert: SafetyAlert) {
    setTarget(alert);
    setResolution('');
    setBlock(false);
    setError('');
  }

  async function resolve() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      if (block && target.holder.status === 'ACTIVE') {
        await request(`/admin/users/${target.holder.id}/status`, {
          method: 'PATCH',
          body: jsonBody({ status: 'BLOCKED', reason: `Alerta de dependente: ${resolution}`.slice(0, 500) }),
        });
      }
      await request(`/admin/safety-alerts/${target.id}/resolve`, { method: 'PATCH', body: jsonBody({ resolution }) });
      setTarget(null);
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Alertas de dependentes"
        subtitle="Casos em que o vínculo entre responsável e dependente precisa de análise. Nenhum CPF aparece aqui."
      />
      <div className="mb-4 flex gap-2">
        {(['OPEN', 'RESOLVED'] as const).map((value) => (
          <button key={value} className={`chip ${status === value ? 'chip-active' : ''}`} aria-pressed={status === value} onClick={() => setStatus(value)}>
            {value === 'OPEN' ? 'Em aberto' : 'Resolvidos'}
          </button>
        ))}
      </div>
      {list.loading ? (
        <SkeletonCards count={3} lines={4} icon label="Carregando alertas..." />
      ) : list.error ? (
        <Notice kind="error">{list.error}</Notice>
      ) : list.data?.data.length ? (
        <ul className="space-y-2">
          {list.data.data.map((alert) => (
            <li key={alert.id} className="card">
              <div className="flex flex-wrap items-start gap-3">
                <ShieldAlert className={`mt-0.5 size-5 shrink-0 ${alert.kind === 'LINK_MISMATCH' ? 'text-danger' : 'text-warning'}`} aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <strong className="text-base">{ALERT_TITLE[alert.kind]}</strong>
                  <p>
                    Titular: <strong>{alert.holder.name}</strong> ({alert.holder.email})
                    {alert.holder.status === 'BLOCKED' && <> <StatusPill tone="red">Bloqueado</StatusPill></>}
                  </p>
                  <AlertBody alert={alert} />
                  <p className="mt-1 text-xs text-muted">Aberto em {dateTime(alert.createdAt)}</p>
                  {alert.resolution && (
                    <p className="mt-1 text-sm">
                      <strong>Resolvido</strong>{alert.resolvedAt && ` em ${dateTime(alert.resolvedAt)}`}: {alert.resolution}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/admin/auditoria?pessoa=${alert.holder.id}&nome=${encodeURIComponent(alert.holder.name)}`} className="btn btn-ghost text-sm">
                    <FileText className="size-4" /> Histórico
                  </Link>
                  {alert.status === 'OPEN' && (
                    <button className="btn btn-primary text-sm" onClick={() => open(alert)}>Resolver</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ShieldAlert className="size-7" />} title={status === 'OPEN' ? 'Nenhum alerta em aberto' : 'Nenhum alerta resolvido'} />
      )}

      <Modal open={Boolean(target)} title="Resolver alerta" onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-4">
            <p><strong>{ALERT_TITLE[target.kind]}</strong> · {target.holder.name}</p>
            <TextArea
              label="O que foi verificado"
              required
              maxLength={2000}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Ex.: falei com o titular e pedi a certidão de nascimento; é a mãe da criança."
            />
            {target.holder.status === 'ACTIVE' && (
              <Checkbox checked={block} onChange={setBlock}>
                Bloquear a conta de {target.holder.name} (encerra as sessões, impede novos agendamentos e cancela as consultas já marcadas, avisando os médicos).
              </Checkbox>
            )}
            {block && (
              <Notice kind="warning">
                Se houver suspeita de crime contra a criança, além de bloquear, comunique o Conselho Tutelar e o Disque 100.
              </Notice>
            )}
            {error && <Notice kind="error">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setTarget(null)}>Voltar</button>
              <button className={block ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy || resolution.trim().length < 5} onClick={() => void resolve()}>
                {block ? 'Bloquear e resolver' : 'Marcar como resolvido'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
