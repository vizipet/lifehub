import type { PropsWithChildren } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, homeFor, useAuth } from './lib/auth';
import type { UserRole } from './lib/types';
import { AppShell } from './ui/AppShell';
import { SkeletonPage } from './ui/kit';
import { StorageNotice } from './ui/StorageNotice';
import {
  LandingPage,
  LoginPage,
  NotFoundPage,
  PasswordRecoveryPage,
  RegisterPage,
} from './pages/public/AuthPages';
import { HealthConsentPage, PrivacyPage, TermsPage } from './pages/public/LegalPages';
import { HomePage } from './pages/patient/HomePage';
import { SearchPage } from './pages/patient/SearchPage';
import { BookingReviewPage, BookingSuccessPage, DoctorPage } from './pages/patient/BookingPages';
import { AppointmentsPage } from './pages/patient/AppointmentsPage';
import { PatientsPage } from './pages/patient/PatientsPage';
import { CampaignsPage, NotificationsPage } from './pages/patient/CampaignsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfessionalDashboard, ProfessionalSetupPage } from './pages/professional/ProfessionalPages';
import { ServicesPage, SlotsPage } from './pages/professional/SchedulePages';
import {
  AdminAuditPage,
  AdminSafetyAlertsPage,
  AdminCampaignsPage,
  AdminClinicsPage,
  AdminOverviewPage,
  AdminProfessionalsPage,
  AdminUsersPage,
} from './pages/admin/AdminPages';

/** Só deixa entrar quem está logado e tem o perfil certo. */
function Protected({ roles, children }: PropsWithChildren<{ roles?: UserRole[] }>) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <SkeletonPage label="Abrindo sua conta..." />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <AppShell>{children}</AppShell>;
}

const P: UserRole[] = ['PATIENT'];
const D: UserRole[] = ['PROFESSIONAL'];
const A: UserRole[] = ['ADMIN'];

/** Telas públicas (início, login, cadastro, termos) que não usam o menu do app. */
const PUBLIC_PATHS = ['/', '/login', '/cadastro', '/cadastro/medico', '/recuperar-senha', '/reset-password', '/termos', '/privacidade', '/consentimento-saude'];

function AppRoutes() {
  const { pathname } = useLocation();
  // Telas públicas entram suave aqui; as do app entram suave dentro do AppShell,
  // assim o menu não "pisca" ao trocar de tela.
  const isPublic = PUBLIC_PATHS.includes(pathname);
  return (
    <div key={isPublic ? pathname : 'app'} className={isPublic ? 'page-enter' : undefined}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage role="PATIENT" />} />
        <Route path="/cadastro/medico" element={<RegisterPage role="PROFESSIONAL" />} />
        <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
        <Route path="/reset-password" element={<PasswordRecoveryPage />} />
        <Route path="/termos" element={<TermsPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
        <Route path="/consentimento-saude" element={<HealthConsentPage />} />

        <Route path="/inicio" element={<Protected roles={P}><HomePage /></Protected>} />
        <Route path="/buscar" element={<Protected roles={P}><SearchPage /></Protected>} />
        <Route path="/medicos/:id" element={<Protected roles={P}><DoctorPage /></Protected>} />
        <Route path="/agendar" element={<Protected roles={P}><BookingReviewPage /></Protected>} />
        <Route path="/agendado" element={<Protected roles={P}><BookingSuccessPage /></Protected>} />
        <Route path="/agenda" element={<Protected roles={P}><AppointmentsPage /></Protected>} />
        <Route path="/pacientes" element={<Protected roles={P}><PatientsPage /></Protected>} />
        <Route path="/campanhas" element={<Protected roles={P}><CampaignsPage /></Protected>} />
        <Route path="/notificacoes" element={<Protected><NotificationsPage /></Protected>} />
        <Route path="/perfil" element={<Protected><ProfilePage /></Protected>} />

        <Route path="/medico" element={<Protected roles={D}><ProfessionalDashboard /></Protected>} />
        <Route path="/medico/cadastro" element={<Protected roles={D}><ProfessionalSetupPage /></Protected>} />
        <Route path="/medico/servicos" element={<Protected roles={D}><ServicesPage /></Protected>} />
        <Route path="/medico/horarios" element={<Protected roles={D}><SlotsPage /></Protected>} />

        <Route path="/admin" element={<Protected roles={A}><AdminOverviewPage /></Protected>} />
        <Route path="/admin/medicos" element={<Protected roles={A}><AdminProfessionalsPage /></Protected>} />
        <Route path="/admin/clinicas" element={<Protected roles={A}><AdminClinicsPage /></Protected>} />
        <Route path="/admin/usuarios" element={<Protected roles={A}><AdminUsersPage /></Protected>} />
        <Route path="/admin/campanhas" element={<Protected roles={A}><AdminCampaignsPage /></Protected>} />
        <Route path="/admin/auditoria" element={<Protected roles={A}><AdminAuditPage /></Protected>} />
        <Route path="/admin/alertas" element={<Protected roles={A}><AdminSafetyAlertsPage /></Protected>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <StorageNotice />
    </AuthProvider>
  );
}
