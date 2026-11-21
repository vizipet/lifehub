import { type FormEvent, type PropsWithChildren, useMemo, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { jsonBody, messageOf, request, type AuthResult } from '../../api';
import { homeFor, useAuth } from '../../lib/auth';
import { isValidCpf, maskCpf, maskPhone, onlyDigits } from '../../lib/format';
import { Checkbox, EmergencyBanner, Field, LegalLinks, Logo, Notice } from '../../ui/kit';

function AuthLayout({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-block" aria-label="LifeHub, página inicial">
          <Logo className="h-11 w-auto" />
        </Link>
        <div className="card p-6">
          <h1 className="text-3xl">{title}</h1>
          <p className="mb-5 mt-1 text-lg text-muted">{subtitle}</p>
          {children}
        </div>
        <div className="mt-5">
          <LegalLinks />
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const features = [
    { photo: 'sala-familia.jpg', alt: 'Médica orientando uma mãe e a filha', title: 'Sem demora', text: 'Veja primeiro os médicos com o horário mais próximo, inclusive para hoje.' },
    { photo: 'pediatria.jpg', alt: 'Pediatra com uma criança no consultório', title: 'Para a família', text: 'Agende para você e para seus dependentes na mesma conta.' },
    { photo: 'medico-prontuario.jpg', alt: 'Médico revisando documentos com uma paciente', title: 'Médicos verificados', text: 'Todo médico tem o CRM conferido antes de aparecer na busca.' },
    { photo: 'checkup.jpg', alt: 'Médica examinando uma menina', title: 'Check-up e retorno', text: 'Consultas presenciais ou por vídeo, com lembrete por e-mail.' },
  ];

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo className="h-10 w-auto" />
        <div className="flex gap-2">
          <Link to="/login" className="btn btn-ghost">Entrar</Link>
          <Link to="/cadastro" className="btn btn-primary hidden sm:inline-flex">Criar conta</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="grid items-center gap-8 py-8 md:grid-cols-2 md:py-14">
          <div>
            <p className="mb-3 text-lg font-bold text-primary">Saúde conectada, cuidado próximo</p>
            <h1 className="text-[2.6rem] leading-[1.05] md:text-[3.4rem]">Sua consulta, sem demora.</h1>
            <p className="mt-4 text-xl text-muted">
              Encontre médicos em Recife, veja o próximo horário livre e agende em poucos toques. Para você e para quem você cuida.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/cadastro" className="btn btn-primary px-6 text-lg">Criar minha conta</Link>
              <Link to="/login" className="btn btn-secondary px-6 text-lg">Já tenho conta</Link>
            </div>
            <p className="mt-4 text-muted">
              É médico? <Link to="/cadastro/medico" className="font-bold text-primary underline">Cadastre-se como profissional</Link>
            </p>
          </div>
          <div className="hidden overflow-hidden rounded-xl md:block">
            <img
              src="/assets/photos/conversa-hero.jpg"
              alt="Médico conversando com uma paciente no consultório"
              className="aspect-[11/10] w-full object-cover"
            />
          </div>
        </section>
        <EmergencyBanner />
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="card overflow-hidden p-0">
              <img src={`/assets/photos/${feature.photo}`} alt={feature.alt} loading="lazy" className="aspect-[3/2] w-full object-cover" />
              <div className="p-4">
                <h2 className="text-xl">{feature.title}</h2>
                <p className="text-muted">{feature.text}</p>
              </div>
            </div>
          ))}
        </section>
        <div className="mt-10">
          <LegalLinks />
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { user, setAuthenticated, authNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Só redireciona quem já chegou logado; após o login, quem decide o destino é o submit.
  const [alreadyLogged] = useState(Boolean(user));

  if (user && alreadyLogged) return <Navigate to={homeFor(user.role)} replace />;

  const looksLikeCpf = /^[\d.\-\s]+$/.test(login) && login.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await request<{ data: AuthResult }>(
        '/auth/login',
        { method: 'POST', body: jsonBody({ login, password }) },
        false,
      );
      setAuthenticated(data);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homeFor(data.user.role), { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre com seu e-mail ou CPF.">
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        {authNotice && <Notice kind="warning">{authNotice}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <Field
          label="E-mail ou CPF"
          autoComplete="username"
          required
          value={looksLikeCpf ? maskCpf(login) : login}
          onChange={(event) => setLogin(event.target.value)}
        />
        <Field
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="text-right">
          <Link to="/recuperar-senha" className="text-sm font-semibold text-primary underline">Esqueci minha senha</Link>
        </div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
        <p className="text-center text-sm text-muted">
          Não tem conta? <Link to="/cadastro" className="font-semibold text-primary underline">Criar conta</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage({ role }: { role: 'PATIENT' | 'PROFESSIONAL' }) {
  const { user, setAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', cpf: '', birthDate: '', password: '', confirm: '' });
  const [accept, setAccept] = useState({ terms: false, privacy: false, health: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isDoctor = role === 'PROFESSIONAL';

  const problems = useMemo(() => {
    const list: Record<string, string> = {};
    if (form.cpf && !isValidCpf(form.cpf)) list.cpf = 'CPF inválido. Confira os números.';
    if (form.phone && !/^\d{10,11}$/.test(onlyDigits(form.phone))) list.phone = 'Informe DDD e número.';
    if (form.password && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))) {
      list.password = 'Mínimo de 8 caracteres, com letras e números.';
    }
    if (form.confirm && form.confirm !== form.password) list.confirm = 'As senhas não conferem.';
    return list;
  }, [form]);
  const [alreadyLogged] = useState(Boolean(user));

  if (user && alreadyLogged) return <Navigate to={homeFor(user.role)} replace />;

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (Object.keys(problems).length) {
      setError('Corrija os campos destacados.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(
        isDoctor ? '/auth/register/professional' : '/auth/register',
        {
          method: 'POST',
          body: jsonBody({
            name: form.name,
            email: form.email,
            phone: onlyDigits(form.phone),
            cpf: onlyDigits(form.cpf),
            birthDate: form.birthDate,
            password: form.password,
            acceptTerms: accept.terms,
            acceptPrivacyPolicy: accept.privacy,
            acceptHealthData: accept.health,
          }),
        },
        false,
      );
      const { data } = await request<{ data: AuthResult }>(
        '/auth/login',
        { method: 'POST', body: jsonBody({ login: form.email, password: form.password }) },
        false,
      );
      setAuthenticated(data);
      navigate(isDoctor ? '/medico/cadastro' : '/inicio', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AuthLayout
      title={isDoctor ? 'Cadastro de médico' : 'Crie sua conta'}
      subtitle={isDoctor ? 'Depois do cadastro, informe seu CRM e envie os documentos para análise.' : 'Leva menos de dois minutos.'}
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate={false}>
        {error && <Notice kind="error">{error}</Notice>}
        {isDoctor && (
          <Notice kind="info" title="Somente médicos com CRM">
            No LifeHub atendem apenas médicos com registro ativo no Conselho Regional de Medicina.
          </Notice>
        )}
        <Field label="Nome completo" autoComplete="name" required minLength={3} maxLength={120} value={form.name} onChange={set('name')} />
        <Field
          label="CPF"
          inputMode="numeric"
          required
          value={maskCpf(form.cpf)}
          onChange={set('cpf')}
          error={problems.cpf}
          hint="Usado para identificar você com segurança. Fica criptografado."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nascimento" type="date" required max={today} min="1900-01-01" value={form.birthDate} onChange={set('birthDate')} />
          <Field label="Celular" inputMode="tel" autoComplete="tel" required value={maskPhone(form.phone)} onChange={set('phone')} error={problems.phone} />
        </div>
        <Field label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <Field
          label="Senha"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={set('password')}
          error={problems.password}
          hint="Mínimo de 8 caracteres, com letras e números."
        />
        <Field label="Confirmar senha" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} error={problems.confirm} />

        <fieldset className="space-y-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Consentimentos (LGPD)</legend>
          <Checkbox checked={accept.terms} onChange={(value) => setAccept((a) => ({ ...a, terms: value }))} required>
            Li e aceito os <Link to="/termos" target="_blank" className="font-semibold text-primary underline">Termos de Uso</Link>.
          </Checkbox>
          <Checkbox checked={accept.privacy} onChange={(value) => setAccept((a) => ({ ...a, privacy: value }))} required>
            Li a <Link to="/privacidade" target="_blank" className="font-semibold text-primary underline">Política de Privacidade</Link> e entendo como meus dados são tratados.
          </Checkbox>
          <Checkbox checked={accept.health} onChange={(value) => setAccept((a) => ({ ...a, health: value }))} required>
            {isDoctor ? (
              <>
                Li como o LifeHub trata dados de saúde e me comprometo a manter <strong>sigilo sobre os dados dos pacientes</strong> que eu
                atender (Código de Ética Médica e LGPD), conforme o{' '}
              </>
            ) : (
              <>
                Autorizo o uso dos meus dados de saúde (e dos meus dependentes) <strong>somente para agendar e gerenciar consultas</strong>, conforme o{' '}
              </>
            )}
            <Link to="/consentimento-saude" target="_blank" className="font-semibold text-primary underline">termo de consentimento</Link>.
          </Checkbox>
        </fieldset>

        <button className="btn btn-primary w-full" disabled={busy || !accept.terms || !accept.privacy || !accept.health}>
          {busy ? 'Criando conta...' : 'Criar conta'}
        </button>
        <p className="text-center text-sm text-muted">
          Já tem conta? <Link to="/login" className="font-semibold text-primary underline">Entrar</Link>
          {!isDoctor && (
            <>
              {' '}· É médico? <Link to="/cadastro/medico" className="font-semibold text-primary underline">Cadastro profissional</Link>
            </>
          )}
        </p>
      </form>
    </AuthLayout>
  );
}

export function PasswordRecoveryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // O token chega no fragmento (#token=...), que não é enviado a servidores.
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/auth/password-reset/request', { method: 'POST', body: jsonBody({ email }) }, false);
      setDone('Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha. Ele vale por 30 minutos.');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request('/auth/password-reset/confirm', { method: 'POST', body: jsonBody({ token, newPassword: password }) }, false);
      window.history.replaceState(null, '', '/reset-password');
      setDone('Senha alterada. Por segurança, todas as sessões abertas foram encerradas.');
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <AuthLayout title="Criar nova senha" subtitle="Escolha uma senha que você não usa em outros sites.">
        <form className="space-y-4" onSubmit={(event) => void confirmReset(event)}>
          {error && <Notice kind="error">{error}</Notice>}
          {done && <Notice kind="success">{done}</Notice>}
          <Field label="Nova senha" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 8 caracteres, com letras e números." />
          <Field label="Confirmar nova senha" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy || Boolean(done)}>Salvar nova senha</button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recuperar acesso" subtitle="Enviaremos um link para o seu e-mail.">
      <form className="space-y-4" onSubmit={(event) => void requestReset(event)}>
        {error && <Notice kind="error">{error}</Notice>}
        {done && <Notice kind="success">{done}</Notice>}
        <Field label="E-mail cadastrado" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={busy}>Enviar link</button>
        <p className="text-center text-sm">
          <Link to="/login" className="font-semibold text-primary underline">Voltar para o login</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function NotFoundPage() {
  const { user } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="card max-w-md text-center">
        <Stethoscope className="mx-auto mb-2 size-10 text-primary" />
        <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
        <p className="mt-1 text-muted">O endereço pode ter mudado ou não existe.</p>
        <Link to={user ? homeFor(user.role) : '/'} className="btn btn-primary mt-4">Voltar ao início</Link>
      </div>
    </div>
  );
}
