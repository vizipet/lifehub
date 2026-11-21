import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Stethoscope, UserRound } from 'lucide-react';
import { request, type Paginated } from '../../api';
import type { SearchResult, Specialty } from '../../lib/types';

/** Sem acento e minúsculo: "cardio" acha "Cardiologia", "pediatra" acha "Pediatria". */
export function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Deixa em negrito o trecho que a pessoa digitou. */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const index = fold(text).indexOf(fold(query.trim()));
  if (!query.trim() || index < 0) return text;
  const end = index + query.trim().length;
  return (
    <>
      {text.slice(0, index)}
      <strong className="font-extrabold">{text.slice(index, end)}</strong>
      {text.slice(end)}
    </>
  );
}

type Suggestion =
  | { kind: 'specialty'; id: string; label: string }
  | { kind: 'doctor'; id: string; label: string; detail: string };

/**
 * Campo de busca com sugestões enquanto digita (combobox acessível):
 * especialidades vêm da lista já carregada; médicos, de uma consulta rápida à API.
 */
export function SearchSuggest({
  value,
  onChange,
  specialties,
  onPickSpecialty,
  onPickDoctor,
}: {
  value: string;
  onChange: (value: string) => void;
  specialties: Specialty[];
  onPickSpecialty: (specialty: Specialty) => void;
  onPickDoctor: (professionalId: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [doctors, setDoctors] = useState<Suggestion[]>([]);
  const lastQuery = useRef('');

  const term = value.trim();

  // Médicos: espera a pessoa parar de digitar (250 ms) e só busca com 2+ letras.
  useEffect(() => {
    if (term.length < 2) {
      setDoctors([]);
      return;
    }
    lastQuery.current = term;
    const timer = window.setTimeout(() => {
      request<Paginated<SearchResult>>(`/search/providers?${new URLSearchParams({ q: term, limit: '8' })}`, {}, false)
        .then((result) => {
          if (lastQuery.current !== term) return;
          const seen = new Set<string>();
          const found: Suggestion[] = [];
          for (const item of result.data) {
            if (seen.has(item.professional.id) || !fold(item.professional.name).includes(fold(term))) continue;
            seen.add(item.professional.id);
            found.push({
              kind: 'doctor',
              id: item.professional.id,
              label: item.professional.name,
              detail: [item.professional.specialty, item.clinic.neighborhood].filter(Boolean).join(' · '),
            });
          }
          setDoctors(found.slice(0, 4));
        })
        .catch(() => setDoctors([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!term) return [];
    const wanted = fold(term);
    const matches = specialties
      .filter((item) => fold(item.name).includes(wanted))
      // Quem começa com o texto digitado vem primeiro.
      .sort((a, b) => Number(fold(b.name).startsWith(wanted)) - Number(fold(a.name).startsWith(wanted)))
      .slice(0, 5)
      .map((item): Suggestion => ({ kind: 'specialty', id: item.id, label: item.name }));
    return [...matches, ...doctors];
  }, [term, specialties, doctors]);

  const visible = open && suggestions.length > 0;

  function pick(suggestion: Suggestion) {
    setOpen(false);
    setActive(-1);
    if (suggestion.kind === 'doctor') {
      onPickDoctor(suggestion.id);
      return;
    }
    const specialty = specialties.find((item) => item.id === suggestion.id);
    if (specialty) onPickSpecialty(specialty);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!visible) {
      if (event.key === 'ArrowDown' && suggestions.length) {
        setOpen(true);
        setActive(0);
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      setActive((index) => (index + 1) % suggestions.length);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
      event.preventDefault();
    } else if (event.key === 'Enter' && active >= 0) {
      // Enter numa sugestão escolhe ela; sem sugestão marcada, faz a busca normal.
      pick(suggestions[active]);
      event.preventDefault();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  const firstDoctor = suggestions.findIndex((item) => item.kind === 'doctor');

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={`${listId}-input`} className="sr-only">Especialidade, médico, clínica ou bairro</label>
      <input
        id={`${listId}-input`}
        className="input"
        placeholder="Ex.: cardiologia, Dra. Helena, Boa Viagem"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {visible && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugestões"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-line bg-papel py-1 shadow-lg"
        >
          {suggestions.map((item, index) => (
            <li key={`${item.kind}-${item.id}`} role="presentation">
              {index === 0 && item.kind === 'specialty' && (
                <p className="px-3 pt-1 pb-0.5 text-xs font-bold uppercase tracking-wide text-muted">Especialidades</p>
              )}
              {index === firstDoctor && (
                <p className="px-3 pt-2 pb-0.5 text-xs font-bold uppercase tracking-wide text-muted">Médicos</p>
              )}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown antes do blur: o clique escolhe a sugestão sem fechar a lista antes.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 ${index === active ? 'bg-soft' : ''}`}
              >
                {item.kind === 'specialty' ? (
                  <Stethoscope className="size-4 shrink-0 text-primary" aria-hidden />
                ) : (
                  <UserRound className="size-4 shrink-0 text-primary" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block break-words"><Highlight text={item.label} query={term} /></span>
                  {item.kind === 'doctor' && item.detail && <span className="block break-words text-sm text-muted">{item.detail}</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
