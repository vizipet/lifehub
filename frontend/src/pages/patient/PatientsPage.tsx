import { type FormEvent, useState } from 'react';
import { Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { jsonBody, messageOf, request } from '../../api';
import { dateShort, isValidCpf, maskCpf, onlyDigits, relationshipLabel, sexLabel } from '../../lib/format';
import type { Patient, Relationship, Sex } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { Avatar, Checkbox, EmptyState, Field, Modal, Notice, PageHeader, SelectField, SkeletonCards } from '../../ui/kit';

const RELATIONSHIPS: Relationship[] = ['CHILD', 'SPOUSE', 'PARENT', 'SIBLING', 'GRANDPARENT', 'OTHER'];
const SEXES: Sex[] = ['FEMALE', 'MALE', 'OTHER', 'NOT_INFORMED'];

type FormState = { name: string; birthDate: string; sex: Sex; relationship: Relationship; cpf: string };
const EMPTY: FormState = { name: '', birthDate: '', sex: 'NOT_INFORMED', relationship: 'CHILD', cpf: '' };

export function PatientsPage() {
  const list = useApi<{ data: Patient[] }>('/patients');
  const [editing, setEditing] = useState<Patient | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [removing, setRemoving] = useState<Patient | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function openNew() {
    setForm(EMPTY);
    setConsent(false);
    setError('');
    setEditing('new');
  }

  function openEdit(patient: Patient) {
    setForm({ name: patient.name, birthDate: patient.birthDate, sex: patient.sex, relationship: patient.relationship === 'SELF' ? 'CHILD' : patient.relationship, cpf: '' });
    setError('');
    setEditing(patient);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (form.cpf && !isValidCpf(form.cpf)) {
      setError('CPF inválido.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        await request('/patients', {
          method: 'POST',
          body: jsonBody({
            name: form.name,
            birthDate: form.birthDate,
            sex: form.sex,
            relationship: form.relationship,
            ...(form.cpf ? { cpf: onlyDigits(form.cpf) } : {}),
            guardianConsent: consent,
          }),
        });
        setMessage('Dependente cadastrado.');
      } else if (editing) {
        const body = editing.isHolder
          ? { sex: form.sex }
          : { name: form.name, birthDate: form.birthDate, sex: form.sex, relationship: form.relationship };
        await request(`/patients/${editing.id}`, { method: 'PATCH', body: jsonBody(body) });
        setMessage('Dados atualizados.');
      }
      setEditing(null);
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError('');
    try {
      await request(`/patients/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      setMessage('Dependente removido.');
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const isHolderEdit = editing !== 'new' && editing?.isHolder;

  return (
    <div>
      <PageHeader
        title="Você e seus dependentes"
        subtitle="Agende consultas para qualquer pessoa da lista."
        action={<button className="btn btn-primary" onClick={openNew}><UserPlus className="size-5" /> Adicionar dependente</button>}
      />
      {message && <div className="mb-3"><Notice kind="success">{message}</Notice></div>}
      {list.loading ? (
        <SkeletonCards count={4} lines={2} avatar grid="md:grid-cols-2" label="Carregando pessoas..." />
      ) : list.data?.data.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.data.data.map((patient) => (
            <li key={patient.id} className="card flex items-center gap-3">
              <Avatar name={patient.name} tone={patient.isHolder ? 'primary' : 'mint'} />
              <div className="min-w-0 flex-1">
                <strong>{patient.name}</strong>
                <p className="text-sm text-muted">
                  {relationshipLabel[patient.relationship]} · {patient.age} anos · nascido(a) em {dateShort(`${patient.birthDate}T12:00:00Z`)}
                </p>
                <p className="text-sm text-muted">CPF: {patient.cpfMasked ?? 'não informado'}</p>
              </div>
              <button className="btn btn-ghost px-3" aria-label={`Editar ${patient.name}`} onClick={() => openEdit(patient)}>
                <Pencil className="size-5" />
              </button>
              {!patient.isHolder && (
                <button className="btn btn-ghost px-3 text-danger" aria-label={`Remover ${patient.name}`} onClick={() => { setError(''); setRemoving(patient); }}>
                  <Trash2 className="size-5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Users className="size-7" />} title="Nenhum paciente" />
      )}
      <div className="mt-4">
        <Notice kind="info">
          O titular é responsável pelos dados e pelas consultas dos dependentes. Para menores de idade, o cadastro deve ser feito pelo responsável legal.
        </Notice>
      </div>

      <Modal open={editing !== null} title={editing === 'new' ? 'Novo dependente' : 'Editar dados'} onClose={() => setEditing(null)}>
        <form className="space-y-4" onSubmit={(event) => void save(event)}>
          {error && <Notice kind="error">{error}</Notice>}
          {isHolderEdit && <Notice kind="info">Seu nome e data de nascimento são alterados em Perfil.</Notice>}
          <Field label="Nome completo" required minLength={3} maxLength={120} disabled={Boolean(isHolderEdit)} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nascimento" type="date" required min="1900-01-01" max={today} disabled={Boolean(isHolderEdit)} value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            <SelectField label="Sexo" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}>
              {SEXES.map((value) => <option key={value} value={value}>{sexLabel[value]}</option>)}
            </SelectField>
          </div>
          {!isHolderEdit && (
            <SelectField label="Parentesco" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value as Relationship })}>
              {RELATIONSHIPS.map((value) => <option key={value} value={value}>{relationshipLabel[value]}</option>)}
            </SelectField>
          )}
          {editing === 'new' && (
            <>
              <Field label="CPF do dependente (opcional)" inputMode="numeric" value={maskCpf(form.cpf)} onChange={(e) => setForm({ ...form, cpf: e.target.value })} hint="Guardado criptografado." />
              <Notice kind="info">
                No dia da consulta, a recepção confere o seu documento e o do dependente (certidão de nascimento ou RG).
                Sem essa conferência, o atendimento não é feito.
              </Notice>
              <Checkbox checked={consent} onChange={setConsent} required>
                Declaro, sob as penas da lei, que sou responsável legal por esta pessoa ou que tenho a autorização dela para
                cadastrar seus dados e agendar consultas. Sei que declarar parentesco falso é crime de falsidade ideológica
                (art. 299 do Código Penal) e que esta declaração fica registrada com data e hora.
              </Checkbox>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy || (editing === 'new' && !consent)}>{busy ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(removing)} title="Remover dependente?" onClose={() => setRemoving(null)}>
        <div className="space-y-4">
          {error && <Notice kind="error">{error}</Notice>}
          <p>
            <strong>{removing?.name}</strong> deixará de aparecer na sua conta e o CPF dele será apagado. O histórico de consultas passadas é mantido.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setRemoving(null)}>Manter</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => void remove()}>Remover</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
