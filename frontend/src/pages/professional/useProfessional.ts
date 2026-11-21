import { useEffect, useState } from 'react';
import { ApiError, messageOf, request } from '../../api';
import type { Clinic, ProfessionalProfile } from '../../lib/types';

/** Perfil profissional (null se ainda não criado) e clínicas do médico logado. */
export function useProfessional() {
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await request<{ data: ProfessionalProfile }>('/professionals/me');
        if (!active) return;
        setProfile(data);
        const list = await request<{ data: Clinic[] }>('/clinics');
        if (active) setClinics(list.data);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setProfile(null);
          setClinics([]);
        } else {
          setError(messageOf(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [version]);

  return { profile, clinics, loading, error, reload: () => setVersion((v) => v + 1) };
}
