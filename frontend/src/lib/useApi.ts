import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf, request } from '../api';

/**
 * Carrega dados de uma rota GET, com estado de carregamento, erro e recarga.
 * `reload({ quiet: true })` atualiza por baixo, sem voltar ao esqueleto
 * (usado depois de uma ação, para a lista não piscar).
 */
export function useApi<T>(path: string | null, authenticated = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const latest = useRef(0);
  const quiet = useRef(false);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const call = ++latest.current;
    if (!quiet.current) setLoading(true);
    quiet.current = false;
    setError('');
    request<T>(path, {}, authenticated)
      .then((result) => {
        if (call === latest.current) setData(result);
      })
      .catch((err: unknown) => {
        if (call === latest.current) setError(messageOf(err));
      })
      .finally(() => {
        if (call === latest.current) setLoading(false);
      });
  }, [path, authenticated, version]);

  const reload = useCallback((options?: { quiet?: boolean }) => {
    quiet.current = Boolean(options?.quiet);
    setVersion((value) => value + 1);
  }, []);
  return { data, loading, error, reload, setData };
}
