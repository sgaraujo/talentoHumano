import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAppRole } from './hooks/useAppRole';
import { LoginPage } from './views/Auth/LoginPage';
import { DashboardPage } from './views/Dashboard/DashboardPage';
import { UsersPage } from './views/Users/UsersPage';
import { QuestionnairesPage } from './views/Questionnaires/QuestionnairesPage';
import { NotificationsPage } from './views/Notifications/NotificationsPage'; // NUEVO
import { AnswerQuestionnairePage } from './views/Public/AnswerQuestionnairePage';
import { MainLayout } from './components/layout/MainLayout';
import { Toaster } from '@/components/ui/sonner';
import { RotationPage } from './views/Analytics/RotationPage';
import ChatWidget from './components/ia/ChatWidget';
import UsersSearchPage from './views/Users/UsersSearchPage';
import ExportQueueTable from './views/Exporter/ExporterPage';
import { CompaniesPage } from './views/Companies/CompaniesPage';
import { CompanyAnalyticsPage } from './views/Companies/CompanyAnalyticsPage';
import { ProjectsPage } from './views/Projects/ProjectsPage';
import { CommunicationsPage } from './views/Communications/CommunicationsPage';
import { ReadCommunicationPage } from './views/Public/ReadCommunicationPage';
import { CtaTrackingPage } from './views/Public/CtaTrackingPage';
import { TaxCalendarPage } from './views/Accounting/TaxCalendarPage';
import { TaxReportPage } from './views/Accounting/TaxReportPage';
import { AccountingMessagesPage } from './views/Accounting/AccountingMessagesPage';
import { RolesPage } from './views/Admin/RolesPage';
import { QuestionnaireSendStatsPage } from './views/Questionnaires/QuestionnaireSendStatsPage';
import { PublicFormPage } from './views/Public/PublicFormPage';
import { EmailSendStatsPage } from './views/Questionnaires/EmailSendStatsPage';
import { WhatsAppPage } from './views/WhatsApp/WhatsAppPage';
import { BulletinsPage } from './views/Bulletins/BulletinsPage';
import { BulletinEditorPage } from './views/Bulletins/BulletinEditorPage';
import { BulletinViewPage } from './views/Bulletins/BulletinViewPage';
import { BulletinStatsPage } from './views/Bulletins/BulletinStatsPage';


/** Redirects authenticated users to their role's home page */
function HomeRedirect() {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  return <Navigate to={role === 'contabilidad' || role === 'financiera' ? '/contabilidad' : '/dashboard'} replace />;
}

/** Renders children only if role can access; otherwise redirects to role home */
function RoleRoute({ children, path }: { children: React.ReactNode; path: string }) {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  const contabilidadRoutes = ['/contabilidad', '/contabilidad/informe', '/contabilidad/mensajes'];
  if ((role === 'contabilidad' || role === 'financiera') && !contabilidadRoutes.includes(path)) return <Navigate to="/contabilidad" replace />;
  return <>{children}</>;
}

/** Admins y Talento Humano — resto redirigido a su home */
function BulletinsRoute({ children }: { children: React.ReactNode }) {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  if (role !== 'admin' && role !== 'talento_humano') return <Navigate to={role === 'contabilidad' || role === 'financiera' ? '/contabilidad' : '/dashboard'} replace />;
  return <>{children}</>;
}

function App() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Rutas públicas — no requieren autenticación */}
        <Route path="/responder/:token"           element={<AnswerQuestionnairePage />} />
        <Route path="/f/:questionnaireId"         element={<PublicFormPage />} />
        <Route path="/comunicado/:token"     element={<ReadCommunicationPage />} />
        <Route path="/comunicado/:token/cta" element={<CtaTrackingPage />} />
        <Route path="/boletin/:id"           element={<BulletinViewPage />} />

        <Route
          path="/login"
          element={
            loading ? <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>
            : isAuthenticated ? <HomeRedirect /> : <LoginPage />
          }
        />

        <Route
          path="/dashboard"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : (
              <RoleRoute path="/dashboard">
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
              </RoleRoute>
            )
          }
        />

        <Route
          path="/usuarios"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><UsersPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/questionarios"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><QuestionnairesPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/estadisticas-cuestionarios"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><QuestionnaireSendStatsPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/estadisticas-correos"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><EmailSendStatsPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/notificaciones"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><NotificationsPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/rotacion-talento"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><RotationPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/chatbot"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><ChatWidget /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/busqueda"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><UsersSearchPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/exportador"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><ExportQueueTable /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/proyectos"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><ProjectsPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/empresas"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><CompaniesPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/empresas/:companyId/analytics"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><CompanyAnalyticsPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/comunicaciones"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><CommunicationsPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/roles"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><RolesPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/contabilidad"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><TaxCalendarPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />
        <Route
          path="/contabilidad/informe"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><TaxReportPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />
        <Route
          path="/contabilidad/mensajes"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><AccountingMessagesPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/whatsapp"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><WhatsAppPage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/boletines"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <BulletinsRoute><MainLayout><BulletinsPage /></MainLayout></BulletinsRoute>
          }
        />
        <Route
          path="/boletines/nuevo"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <BulletinsRoute><MainLayout><BulletinEditorPage /></MainLayout></BulletinsRoute>
          }
        />
        <Route
          path="/boletines/:id/editar"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <BulletinsRoute><MainLayout><BulletinEditorPage /></MainLayout></BulletinsRoute>
          }
        />
        <Route
          path="/boletines/:id/estadisticas"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <BulletinsRoute><MainLayout><BulletinStatsPage /></MainLayout></BulletinsRoute>
          }
        />

        <Route
          path="*"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <HomeRedirect />
          }
        />

        
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;