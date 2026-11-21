import { CalendarDays, Clock, Megaphone, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { firstName, modalityLabel, money, todayKey, whenLabel } from '../../lib/format';
import type { Appointment, SearchResult } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import type { Paginated } from '../../api';
import { EmergencyBanner, SkeletonCards } from '../../ui/kit';
import { AppointmentCard } from './AppointmentsPage';

export function HomePage() {
  const { user } = useAuth();
  const next = useApi<{ data: Appointment[] }>('/appointments?view=upcoming');
  const soon = useApi<Paginated<SearchResult>>(`/search/providers?date=${todayKey()}&limit=3`, false);
  const upcoming = next.data?.data?.[0];

  const shortcuts = [
    { to: '/buscar?quando=hoje', icon: Clock, title: 'Consulta hoje', text: 'Horários livres ainda hoje' },
    { to: '/buscar', icon: Search, title: 'Buscar médico', text: 'Por especialidade ou nome' },
    { to: '/agenda', icon: CalendarDays, title: 'Minha agenda', text: 'Consultas e histórico' },
    { to: '/pacientes', icon: Users, title: 'Dependentes', text: 'Cuide da sua família' },
    { to: '/campanhas', icon: Megaphone, title: 'Campanhas', text: 'Vacinação e prevenção' },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-primary p-6 text-on-accent">
        <p className="text-lg text-on-accent/85">Olá, {user ? firstName(user.name) : ''}!</p>
        <h1 className="mt-1 text-3xl md:text-4xl">Precisa de uma consulta?</h1>
        <p className="mt-2 max-w-lg text-lg text-on-accent/90">Mostramos primeiro quem atende mais cedo. Agende para você ou para um dependente.</p>
        <Link to="/buscar" className="btn mt-4 bg-papel text-primary hover:bg-cal">
          <Search className="size-5" /> Encontrar horário
        </Link>
      </section>

      <EmergencyBanner compact />

      <section aria-labelledby="atalhos">
        <h2 id="atalhos" className="mb-3 text-2xl">O que você precisa?</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {shortcuts.map((item) => (
            <Link key={item.to} to={item.to} className="card flex flex-col gap-1 transition-colors hover:border-primary">
              <item.icon className="size-6 text-primary" aria-hidden />
              <strong className="text-lg leading-tight">{item.title}</strong>
              <span className="text-muted">{item.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="proxima">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="proxima" className="text-2xl">Próxima consulta</h2>
          <Link to="/agenda" className="btn btn-ghost min-h-11">Ver agenda</Link>
        </div>
        {next.loading ? (
          <SkeletonCards count={1} lines={3} label="Carregando sua próxima consulta..." />
        ) : upcoming ? (
          <AppointmentCard appointment={upcoming} />
        ) : (
          <div className="card text-muted">Nenhuma consulta marcada. <Link to="/buscar" className="font-bold text-primary underline">Agendar agora</Link></div>
        )}
      </section>

      <section aria-labelledby="hoje">
        <h2 id="hoje" className="mb-3 text-2xl">Ainda hoje</h2>
        {soon.loading ? (
          <SkeletonCards count={3} lines={3} grid="md:grid-cols-3" label="Buscando horários livres..." />
        ) : soon.data?.data.length ? (
          <div className="grid gap-3 md:grid-cols-3">
            {soon.data.data.map((item) => (
              <Link key={`${item.professional.id}-${item.clinic.id}`} to={`/medicos/${item.professional.id}`} className="card transition-colors hover:border-primary">
                <strong className="text-lg">{item.professional.name}</strong>
                <p className="text-muted">{item.professional.specialty}</p>
                <p className="mt-2 font-bold text-primary">{whenLabel(item.nextAvailableAt)}</p>
                <p className="text-muted">
                  {modalityLabel[item.nextService.modality]}, {money(item.nextService.priceCents)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card text-muted">Não há mais horários livres hoje. Veja os próximos dias na busca.</div>
        )}
      </section>
    </div>
  );
}
