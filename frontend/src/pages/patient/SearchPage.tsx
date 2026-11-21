import { type FormEvent, useMemo, useState } from 'react';
import { MapPin, Search, Stethoscope, Video } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchSuggest } from './SearchSuggest';
import type { Paginated } from '../../api';
import { modalityLabel, money, todayKey, tomorrowKey, whenLabel } from '../../lib/format';
import type { SearchResult, Specialty } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { Avatar, EmptyState, Notice, PageHeader, SkeletonCards } from '../../ui/kit';

const WHEN = [
  { value: '', label: 'Qualquer dia' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'amanha', label: 'Amanhã' },
] as const;

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [text, setText] = useState(params.get('q') ?? '');
  const specialties = useApi<{ data: Specialty[] }>('/specialties', false);

  const q = params.get('q') ?? '';
  const specialtyId = params.get('especialidade') ?? '';
  const modality = params.get('modalidade') ?? '';
  const when = params.get('quando') ?? '';
  const page = Number(params.get('pagina') ?? '1');

  const path = useMemo(() => {
    const query = new URLSearchParams({ page: String(page), limit: '10' });
    if (q) query.set('q', q);
    if (specialtyId) query.set('specialtyId', specialtyId);
    if (modality) query.set('modality', modality);
    if (when === 'hoje') query.set('date', todayKey());
    if (when === 'amanha') query.set('date', tomorrowKey());
    return `/search/providers?${query}`;
  }, [q, specialtyId, modality, when, page]);

  const results = useApi<Paginated<SearchResult>>(path, false);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    update('q', text.trim());
  }

  return (
    <div>
      <PageHeader title="Buscar atendimento" subtitle="Ordenado pelo horário livre mais próximo." />

      <form onSubmit={submit} className="card mb-4 space-y-4" role="search">
        <div className="flex gap-2">
          <SearchSuggest
            value={text}
            onChange={setText}
            specialties={specialties.data?.data ?? []}
            onPickSpecialty={(specialty) => {
              // Escolher a especialidade vira filtro (mais preciso que busca por texto).
              setText('');
              const next = new URLSearchParams(params);
              next.delete('q');
              next.delete('pagina');
              next.set('especialidade', specialty.id);
              setParams(next);
            }}
            onPickDoctor={(id) => navigate(`/medicos/${id}`)}
          />
          <button className="btn btn-primary px-5" aria-label="Buscar">
            <Search className="size-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quando">
          {WHEN.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-pressed={when === item.value}
              className={`chip ${when === item.value ? 'chip-active' : ''}`}
              onClick={() => update('quando', item.value)}
            >
              {item.label}
            </button>
          ))}
          <span className="mx-1 w-px bg-line" aria-hidden />
          {(['', 'IN_PERSON', 'REMOTE'] as const).map((value) => (
            <button
              type="button"
              key={value || 'todas'}
              aria-pressed={modality === value}
              className={`chip ${modality === value ? 'chip-active' : ''}`}
              onClick={() => update('modalidade', value)}
            >
              {value === '' ? 'Todas as modalidades' : modalityLabel[value]}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="esp" className="label">Especialidade</label>
          <select id="esp" className="input md:max-w-sm" value={specialtyId} onChange={(event) => update('especialidade', event.target.value)}>
            <option value="">Todas</option>
            {specialties.data?.data.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      </form>

      {results.error && <Notice kind="error">{results.error}</Notice>}
      {results.loading ? (
        <SkeletonCards count={4} lines={3} avatar action label="Buscando horários..." />
      ) : results.data && results.data.data.length === 0 ? (
        <EmptyState icon={<Stethoscope className="size-7" />} title="Nenhum horário encontrado">
          Tente outro dia, outra especialidade ou remova filtros.
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {results.data?.meta.total ?? 0} médico(s) com horário disponível
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {results.data?.data.map((item) => (
              <li key={`${item.professional.id}-${item.clinic.id}`} className="card">
                <div className="flex gap-3">
                  <Avatar name={item.professional.name} photoUrl={item.professional.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold">{item.professional.name}</h2>
                    <p className="text-sm text-muted">
                      {item.professional.specialty} · CRM {item.professional.crm}/{item.professional.crmState}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                      <MapPin className="size-4" aria-hidden /> {item.clinic.name} · {item.clinic.neighborhood}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-soft p-3">
                  <div>
                    <p className="text-sm text-muted">Próximo horário</p>
                    <p className="font-bold text-primary">{whenLabel(item.nextAvailableAt)}</p>
                    <p className="flex items-center gap-1 text-sm">
                      {item.nextService.modality === 'REMOTE' && <Video className="size-4" aria-hidden />}
                      {item.nextService.name} · {modalityLabel[item.nextService.modality]} · {money(item.nextService.priceCents)}
                    </p>
                  </div>
                  <Link to={`/medicos/${item.professional.id}`} className="btn btn-primary">Ver horários</Link>
                </div>
              </li>
            ))}
          </ul>
          {results.data && results.data.meta.totalPages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Páginas">
              <button className="btn btn-secondary" disabled={page <= 1} onClick={() => update('pagina', String(page - 1))}>Anterior</button>
              <span className="text-sm text-muted">Página {page} de {results.data.meta.totalPages}</span>
              <button className="btn btn-secondary" disabled={page >= results.data.meta.totalPages} onClick={() => update('pagina', String(page + 1))}>Próxima</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
