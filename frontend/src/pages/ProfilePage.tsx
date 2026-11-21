import { type FormEvent, useEffect, useState } from 'react';
import { Download, LogOut, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { jsonBody, messageOf, request } from '../api';
import { useAuth } from '../lib/auth';
import { dateShort, maskPhone, onlyDigits } from '../lib/format';
import type { NotificationPreferences, User } from '../lib/types';
import { Field, LegalLinks, Modal, Notice, PageHeader } from '../ui/kit';

export function ProfilePage() {
  const { user, updateUser, signOut, clearLocalSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: user?.name ?? '', phone: user?.phone ?? '', email: user?.email ?? '', currentPassword: '', newPassword: '' });
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  useEffect(() => {
    request<{ data: NotificationPreferences }>('/privacy/notification-preferences')
      .then(({ data }) => setPrefs(data))
      .catch(() => setPrefs(null));
  }, []);

  if (!user) return null;
  const sensitive = form.email.trim().toLowerCase() !== user.email || Boolean(form.newPassword);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body: Record<string, string> = {};
      if (form.name !== user!.name) body.name = form.name;
      if (onlyDigits(form.phone) !== user!.phone) body.phone = onlyDigits(form.phone);
      if (form.email.trim().toLowerCase() !== user!.email) body.email = form.email.trim();
      if (form.newPassword) body.newPassword = form.newPassword;
      if (sensitive) body.currentPassword = form.currentPassword;
      if (!Object.keys(body).length) {
        setMessage('Nada para salvar.');
        return;
      }
      const { data } = await request<{ data: User }>('/users/me', { method: 'PATCH', body: jsonBody(body) });
      if (form.newPassword) {
        // Trocar a senha encerra todas as sessões, inclusive esta.
        clearLocalSession();
        navigate('/login', { replace: true });
        return;
      }
      updateUser(data);
      setForm((current) => ({ ...current, currentPassword: '', newPassword: '' }));
      setMessage('Dados atualizados.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function togglePref(key: keyof NotificationPreferences) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      await request('/privacy/notification-preferences', { method: 'PATCH', body: jsonBody({ [key]: next[key] }) });
    } catch (err) {
      setPrefs(prefs);
      setError(messageOf(err));
    }
  }

  async function exportData() {
    setError('');
    try {
      const data = await request<unknown>('/privacy/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lifehub-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError('');
    try {
      await request('/privacy/account-deletion', { method: 'POST', body: jsonBody({ currentPassword: deletePassword }) });
      clearLocalSession();
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  const prefItems: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
    { key: 'emailEnabled', label: 'Receber e-mails', hint: 'Desligado, nenhum e-mail é enviado.' },
    { key: 'appointmentReminders', label: 'Lembretes de consulta', hint: 'Aviso antes de cada consulta.' },
    { key: 'campaignUpdates', label: 'Campanhas de saúde', hint: 'Novidades de vacinação e prevenção. Opcional.' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Meu perfil" subtitle={`${user.email} · CPF ${user.cpfMasked ?? '—'} · nascimento ${dateShort(`${user.birthDate}T12:00:00Z`)}`} />
      {message && <Notice kind="success">{message}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {user.role === 'PATIENT' && (
        <Link to="/pacientes" className="card flex items-center gap-3 hover:border-primary">
          <Users className="size-6 text-primary" />
          <div>
            <strong>Você e seus dependentes</strong>
            <p className="text-sm text-muted">Cadastre filhos, pais ou cônjuge para agendar por eles.</p>
          </div>
        </Link>
      )}

      <form className="card space-y-4" onSubmit={(event) => void saveProfile(event)}>
        <h2 className="text-lg font-extrabold">Dados pessoais</h2>
        <Field label="Nome completo" required minLength={3} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Celular" inputMode="tel" value={maskPhone(form.phone)} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Field label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <Field label="Nova senha (opcional)" type="password" autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} hint="Ao trocar a senha, todas as sessões são encerradas." />
        {sensitive && (
          <Field label="Senha atual" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} hint="Necessária para trocar e-mail ou senha." />
        )}
        <p className="text-sm text-muted">CPF e data de nascimento não podem ser alterados pelo app.</p>
        <button className="btn btn-primary" disabled={busy}>Salvar</button>
      </form>

      {prefs && (
        <section className="card space-y-3" aria-labelledby="prefs">
          <h2 id="prefs" className="text-lg font-extrabold">Comunicações</h2>
          {prefItems.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl p-1">
              <span>
                <strong className="block">{item.label}</strong>
                <span className="text-sm text-muted">{item.hint}</span>
              </span>
              <input type="checkbox" role="switch" className="size-6 accent-[var(--color-primary)]" checked={prefs[item.key]} onChange={() => void togglePref(item.key)} />
            </label>
          ))}
        </section>
      )}

      <section className="card space-y-3" aria-labelledby="priv">
        <h2 id="priv" className="flex items-center gap-2 text-lg font-extrabold"><ShieldCheck className="size-5 text-primary" /> Privacidade e seus dados (LGPD)</h2>
        <p className="text-muted">Você pode baixar uma cópia de todos os seus dados ou excluir sua conta a qualquer momento.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-secondary" onClick={() => void exportData()}><Download className="size-5" /> Baixar meus dados</button>
          <button className="btn btn-secondary border-danger text-danger" onClick={() => { setError(''); setDeleteOpen(true); }}>
            <Trash2 className="size-5" /> Excluir minha conta
          </button>
        </div>
        <LegalLinks />
      </section>

      <button className="btn btn-ghost w-full" onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}>
        <LogOut className="size-5" /> Sair da conta
      </button>

      <Modal open={deleteOpen} title="Excluir conta definitivamente?" onClose={() => setDeleteOpen(false)}>
        <div className="space-y-4">
          <Notice kind="warning" title="Esta ação não pode ser desfeita">
            Seus dados pessoais e os dos seus dependentes serão apagados. Consultas futuras serão canceladas e os horários liberados.
            {user.role === 'PROFESSIONAL' && ' Como médico, você sairá da busca e as consultas marcadas com você serão canceladas.'}
          </Notice>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Senha atual" type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
          <Field label='Digite "EXCLUIR" para confirmar' value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>Cancelar</button>
            <button className="btn btn-danger" disabled={busy || deleteConfirm !== 'EXCLUIR' || !deletePassword} onClick={() => void deleteAccount()}>
              Excluir conta
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
