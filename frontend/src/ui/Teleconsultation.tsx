import { useEffect, useRef, useState } from 'react';
import { Video } from 'lucide-react';
import { messageOf, request } from '../api';
import type { Appointment } from '../lib/types';

export function Teleconsultation({ appointment }: { appointment: Appointment }) {
  const [now, setNow] = useState(Date.now);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const start = Date.parse(appointment.slot.startsAt);
  const end = Date.parse(appointment.slot.endsAt);
  const valid = appointment.status === 'CONFIRMED' && appointment.serviceModalitySnapshot === 'REMOTE';
  const open = valid && now >= start - 15 * 60000 && now < end;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); generation.current++; };
  }, []);
  useEffect(() => { if (!open) { generation.current++; setUrl(''); setBusy(false); } }, [open]);
  if (!valid || now >= end) return null;
  async function join() {
    if (busy || !open) return;
    const attempt = ++generation.current;
    setBusy(true); setError(''); setUrl('');
    try {
      const res = await request<{ data: { url: string } }>(`/appointments/${appointment.id}/teleconsultation`, { method: 'POST', cache: 'no-store' });
      if (attempt === generation.current) setUrl(res.data.url);
    } catch (err) { if (attempt === generation.current) setError(messageOf(err)); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  return <div className="w-full space-y-2">
    <button className="btn btn-primary" disabled={!open || busy} onClick={() => void join()}><Video className="size-4" />{busy ? 'Preparando sala…' : 'Entrar na teleconsulta'}</button>
    {!open && <p className="text-sm text-muted">Sala disponível 15 minutos antes da consulta.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {url && open && <div className="space-y-2">
      <p className="text-sm text-muted">Demonstração acadêmica. Não compartilhe o link. Permita câmera e microfone.</p>
      {window.isSecureContext && <iframe title="Sala de teleconsulta" src={url} allow="camera; microphone; autoplay; fullscreen" referrerPolicy="no-referrer" className="w-full rounded-lg border-0" style={{height: '65vh'}} />}
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">{window.isSecureContext ? 'Abrir no navegador (alternativa)' : 'Abrir sala segura no navegador'}</a>
        <button className="btn btn-ghost" onClick={() => setUrl('')}>Fechar sala</button>
      </div>
    </div>}
  </div>;
}
