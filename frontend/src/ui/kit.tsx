import {
  cloneElement,
  type InputHTMLAttributes,
  type ReactElement,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react';
import { apiAssetUrl } from '../api';
import { AlertTriangle, CheckCircle2, Info, Loader2, Phone, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { initials } from '../lib/format';

export function Logo({ className = 'h-10' }: { className?: string }) {
  return <img src="/assets/lifehub-logo.svg" alt="LifeHub" className={className} />;
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {props.required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        {...props}
      />
      {(hint || error) && (
        <p id={`${id}-hint`} className={`mt-1 text-sm ${error ? 'text-danger' : 'text-muted'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  children,
  hint,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {props.required && <span className="text-danger"> *</span>}
      </label>
      <select id={id} className="input" {...props}>
        {children}
      </select>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {props.required && <span className="text-danger"> *</span>}
      </label>
      <textarea id={id} className="input min-h-24" {...props} />
    </div>
  );
}

/** Caixa de seleção para consentimento: nunca vem marcada. */
export function Checkbox({
  checked,
  onChange,
  children,
  required,
}: PropsWithChildren<{ checked: boolean; onChange: (value: boolean) => void; required?: boolean }>) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-1 leading-relaxed">
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]"
        checked={checked}
        required={required}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function Notice({
  kind = 'info',
  children,
  title,
}: PropsWithChildren<{ kind?: 'info' | 'error' | 'success' | 'warning'; title?: string }>) {
  const styles = {
    info: 'border-azul/30 bg-azul-claro/60 text-ink',
    error: 'border-danger/40 bg-danger/8 text-danger',
    success: 'border-success/40 bg-success/10 text-ink',
    warning: 'border-warning/40 bg-warning/10 text-ink',
  }[kind];
  const Icon = kind === 'error' || kind === 'warning' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg border p-3.5 ${styles}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Esqueletos de carregamento: o contorno do conteúdo pisca suavemente
// enquanto os dados chegam. Com "reduzir movimento" ligado, fica parado.
// ---------------------------------------------------------------------------

/** Um bloco cinza do esqueleto. Tamanho e forma vêm do className. */
export function Skeleton({ className = '' }: { className?: string }) {
  // Só usa o arredondamento padrão quando o className não traz o seu.
  const rounded = /(^|\s)rounded/.test(className) ? '' : 'rounded-md';
  return <span aria-hidden className={`block animate-pulse bg-line/70 ${rounded} ${className}`} />;
}

/** Avisa o leitor de tela uma vez, sem ler cada bloco cinza. */
function SkeletonRegion({ label, className, children }: PropsWithChildren<{ label: string; className?: string }>) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const LINE_WIDTHS = ['w-2/5', 'w-3/4', 'w-1/2', 'w-2/3'];

/**
 * Lista de cartões fantasmas no mesmo formato da lista real.
 * `grid` recebe as colunas da lista verdadeira (ex.: "md:grid-cols-2").
 */
export function SkeletonCards({
  count = 3,
  lines = 2,
  avatar = false,
  icon = false,
  action = false,
  banner = false,
  grid = '',
  label = 'Carregando...',
}: {
  count?: number;
  lines?: number;
  avatar?: boolean;
  icon?: boolean;
  action?: boolean;
  banner?: boolean;
  grid?: string;
  label?: string;
}) {
  return (
    <SkeletonRegion label={label} className={`grid gap-3 ${grid}`}>
      {Array.from({ length: count }, (_, card) => (
        <div key={card} className={`card ${banner ? 'overflow-hidden p-0' : 'flex items-center gap-3'}`}>
          {banner && <Skeleton className="h-24 w-full rounded-none" />}
          <div className={banner ? 'space-y-2 p-4' : 'contents'}>
            {avatar && <Skeleton className="size-14 shrink-0 rounded-2xl" />}
            {icon && <Skeleton className="size-6 shrink-0 self-start rounded-full" />}
            <div className="min-w-0 flex-1 space-y-2">
              {Array.from({ length: lines }, (_, line) => (
                <Skeleton
                  key={line}
                  className={`${line === 0 ? 'h-5' : 'h-3.5'} ${LINE_WIDTHS[(line + card) % LINE_WIDTHS.length]}`}
                />
              ))}
            </div>
            {action && !banner && <Skeleton className="h-10 w-24 shrink-0 rounded-full" />}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Números do painel (visão geral). */
export function SkeletonStats({ count = 6, grid = 'grid-cols-2 md:grid-cols-3' }: { count?: number; grid?: string }) {
  return (
    <SkeletonRegion label="Carregando números..." className={`grid gap-3 ${grid}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card space-y-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Página inteira: título, subtítulo e alguns cartões. */
export function SkeletonPage({ label = 'Carregando...', cards = 3 }: { label?: string; cards?: number }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <SkeletonCards count={cards} lines={3} label={label} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: PropsWithChildren<{ icon?: ReactNode; title: string; action?: ReactNode }>) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      {icon && <div className="mb-1 grid size-14 place-items-center rounded-xl bg-soft text-primary">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <p className="max-w-sm text-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Avatar({
  name,
  photoUrl,
  tone = 'primary',
  size = 'md',
}: {
  name: string;
  photoUrl?: string | null;
  tone?: 'primary' | 'coral' | 'mint';
  size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'size-24 rounded-xl' : 'size-14 rounded-lg';
  if (photoUrl) {
    // Fotos da demonstração são de meio corpo: aproxima no rosto. A foto enviada
    // pelo médico já chega recortada no rosto, então aparece inteira.
    const uploaded = photoUrl.startsWith('/public/');
    return (
      <div className={`${box} shrink-0 overflow-hidden border border-line bg-soft`}>
        <img
          src={apiAssetUrl(photoUrl)}
          alt=""
          loading="lazy"
          className={uploaded ? 'h-full w-full object-cover' : 'h-full w-full origin-[50%_10%] scale-[1.7] object-cover object-top'}
        />
      </div>
    );
  }
  const bg = { primary: 'bg-primary', coral: 'bg-pitanga', mint: 'bg-azul' }[tone];
  return (
    <div className={`grid ${box} shrink-0 place-items-center ${bg} font-title text-xl font-extrabold text-on-accent`} aria-hidden>
      {initials(name)}
    </div>
  );
}

export function StatusPill({ tone, children }: PropsWithChildren<{ tone: 'green' | 'yellow' | 'red' | 'gray' | 'blue' }>) {
  const styles = {
    green: 'bg-success/12 text-success',
    yellow: 'bg-warning/15 text-warning',
    red: 'bg-danger/10 text-danger',
    gray: 'bg-ink/8 text-muted',
    blue: 'bg-info/10 text-info',
  }[tone];
  return <span className={`pill ${styles}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-lg text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Aviso fixo: o app não é para emergências. */
export function EmergencyBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-pitanga/40 bg-pitanga/10 ${compact ? 'p-3' : 'p-4'}`}>
      <Phone className="mt-1 size-5 shrink-0 text-pitanga" aria-hidden />
      <p>
        <strong>Emergência?</strong> O LifeHub é para consultas agendadas. Em caso de emergência, ligue{' '}
        <a href="tel:192" className="font-bold text-danger underline">192 (SAMU)</a> ou procure a UPA mais próxima.
      </p>
    </div>
  );
}

/** Diálogo modal acessível (substitui window.confirm). */
export function Modal({
  open,
  title,
  onClose,
  children,
}: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-papel p-0 text-ink backdrop:bg-black/55"
    >
      {open && (
        <div className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-xl font-extrabold">{title}</h2>
            <button type="button" className="btn btn-ghost -mr-2 -mt-2 px-2" onClick={onClose} aria-label="Fechar">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function LegalLinks() {
  return (
    <nav aria-label="Documentos legais" className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-muted">
      <Link className="underline underline-offset-2 hover:text-ink" to="/termos">Termos de Uso</Link>
      <Link className="underline underline-offset-2 hover:text-ink" to="/privacidade">Política de Privacidade</Link>
      <Link className="underline underline-offset-2 hover:text-ink" to="/consentimento-saude">Uso dos dados de saúde</Link>
    </nav>
  );
}

/**
 * Balão de ajuda: aparece ao passar o mouse ou ao chegar no botão pelo
 * teclado (Tab). Ligado ao botão por aria-describedby, então o leitor de
 * tela também lê a explicação.
 */
export function Tooltip({
  text,
  children,
  align = 'center',
  full = false,
}: {
  text: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  align?: 'center' | 'end';
  /** Para botões que ocupam a largura toda. */
  full?: boolean;
}) {
  const id = useId();
  const position = align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className={`group/tip relative ${full ? 'flex w-full' : 'inline-flex'}`}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none invisible absolute bottom-full z-40 mb-1.5 w-max max-w-72 rounded-md bg-ink px-2 py-1 text-center text-xs font-medium leading-tight text-cal opacity-0 transition-opacity delay-150 duration-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100 ${position}`}
      >
        {text}
        {/* setinha apontando para o botão */}
        <span
          aria-hidden
          className={`absolute top-full size-0 border-x-4 border-t-4 border-x-transparent border-t-ink ${align === 'end' ? 'right-3' : 'left-1/2 -translate-x-1/2'}`}
        />
      </span>
    </span>
  );
}
