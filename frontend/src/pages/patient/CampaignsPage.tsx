import { Bell, CheckCheck, ExternalLink, Megaphone } from 'lucide-react';
import { messageOf, request, type Paginated } from '../../api';
import { dateShort, dateTime } from '../../lib/format';
import type { AppNotification, Campaign } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { EmptyState, Notice, PageHeader, SkeletonCards } from '../../ui/kit';
import { useState } from 'react';

export function CampaignsPage() {
  const list = useApi<{ data: Campaign[] }>('/campaigns', false);
  return (
    <div>
      <PageHeader title="Campanhas de saúde" subtitle="Ações de vacinação e prevenção com fonte oficial conferida." />
      {list.error && <Notice kind="error">{list.error}</Notice>}
      {list.loading ? (
        <SkeletonCards count={4} lines={3} banner grid="md:grid-cols-2" label="Carregando campanhas..." />
      ) : list.data?.data.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.data.map((campaign) => (
            <article key={campaign.id} className="card overflow-hidden p-0">
              <div className="bg-gradient-to-br from-primary to-mint p-5 text-on-accent">
                <p className="text-sm font-semibold uppercase tracking-wide text-on-accent/85">{campaign.type === 'VACINACAO' ? 'Vacinação' : 'Prevenção'}</p>
                <h2 className="text-xl font-extrabold">{campaign.title}</h2>
                <p className="text-sm text-on-accent/90">{campaign.agency}</p>
              </div>
              <dl className="space-y-2 p-5 text-sm">
                <div><dt className="font-semibold">Período</dt><dd className="text-muted">{dateShort(campaign.startsAt)} a {dateShort(campaign.endsAt)}</dd></div>
                <div><dt className="font-semibold">Para quem</dt><dd className="text-muted">{campaign.targetAudience}</dd></div>
                <div><dt className="font-semibold">Onde</dt><dd className="text-muted">{campaign.location}</dd></div>
                <div><dt className="font-semibold">O que levar</dt><dd className="text-muted">{campaign.requirements}</dd></div>
                <a href={campaign.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-2">
                  Fonte oficial <ExternalLink className="size-4" />
                </a>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Megaphone className="size-7" />} title="Nenhuma campanha ativa">Quando houver campanhas na sua região, elas aparecem aqui.</EmptyState>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const list = useApi<Paginated<AppNotification>>('/notifications?limit=50');
  const [error, setError] = useState('');

  async function markAll() {
    try {
      await request('/notifications/read-all', { method: 'PATCH' });
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function markOne(id: string) {
    try {
      await request(`/notifications/${id}/read`, { method: 'PATCH' });
      list.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const unread = list.data?.data.filter((item) => !item.readAt).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notificações"
        subtitle={unread ? `${unread} não lida(s)` : 'Tudo em dia'}
        action={unread ? <button className="btn btn-secondary" onClick={() => void markAll()}><CheckCheck className="size-5" /> Marcar todas como lidas</button> : undefined}
      />
      {(error || list.error) && <Notice kind="error">{error || list.error}</Notice>}
      {list.loading ? (
        <SkeletonCards count={4} lines={2} icon label="Carregando notificações..." />
      ) : list.data?.data.length ? (
        <ul className="space-y-2">
          {list.data.data.map((item) => (
            <li key={item.id} className={`card flex gap-3 ${item.readAt ? 'opacity-75' : 'border-primary/40'}`}>
              <Bell className={`mt-1 size-5 shrink-0 ${item.readAt ? 'text-muted' : 'text-primary'}`} aria-hidden />
              <div className="flex-1">
                <strong>{item.title}</strong>
                <p className="text-muted">{item.message}</p>
                <time className="text-xs text-muted">{dateTime(item.createdAt)}</time>
              </div>
              {!item.readAt && (
                <button className="btn btn-ghost text-sm" onClick={() => void markOne(item.id)}>Marcar como lida</button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Bell className="size-7" />} title="Sem notificações">Lembretes de consulta e avisos aparecem aqui.</EmptyState>
      )}
    </div>
  );
}
