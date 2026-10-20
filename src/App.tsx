import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useAppRole } from './hooks/useAppRole';
import { MainLayout } from './components/layout/MainLayout';
import { PageLoader } from './components/layout/PageLoader';
import { Toaster } from '@/components/ui/sonner';
import { AssistantCompanion } from './components/ia/AssistantCompanion';
import { ACCOUNTING_HOME_ROLES, type AppRole } from './models/types/AppRole';

// Cada página se descarga solo cuando se visita. Antes toda la app (Excel, PDF,
// gráficas y ~35 páginas) iba en un único archivo de 3.4 MB, muy lento en celular.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })));

const LoginPage                  = page(() => import('./views/Auth/LoginPage'), 'LoginPage');
const DashboardPage              = page(() => import('./views/Dashboard/DashboardPage'), 'DashboardPage');
const UsersPage                  = page(() => import('./views/Users/UsersPage'), 'UsersPage');
const HrControlPage              = page(() => import('./views/Users/HrControlPage'), 'HrControlPage');
const QuestionnairesPage         = page(() => import('./views/Questionnaires/QuestionnairesPage'), 'QuestionnairesPage');
const NotificationsPage          = page(() => import('./views/Notifications/NotificationsPage'), 'NotificationsPage');
const AnswerQuestionnairePage    = page(() => import('./views/Public/AnswerQuestionnairePage'), 'AnswerQuestionnairePage');
const RotationPage               = page(() => import('./views/Analytics/RotationPage'), 'RotationPage');
const ExportQueueTable           = page(() => import('./views/Exporter/ExporterPage'), 'default');
const CompaniesPage              = page(() => import('./views/Companies/CompaniesPage'), 'CompaniesPage');
const CompanyWorkforcePage       = page(() => import('./views/Companies/CompanyWorkforcePage'), 'CompanyWorkforcePage');
const CompanySettingsPage        = page(() => import('./views/Companies/CompanySettingsPage'), 'CompanySettingsPage');
const ProjectsPage               = page(() => import('./views/Projects/ProjectsPage'), 'ProjectsPage');
const AnalyticalAccountStatsPage = page(() => import('./views/Projects/AnalyticalAccountStatsPage'), 'AnalyticalAccountStatsPage');
const CommunicationsPage         = page(() => import('./views/Communications/CommunicationsPage'), 'CommunicationsPage');
const CommunicationsStatsPage    = page(() => import('./views/Communications/CommunicationsStatsPage'), 'CommunicationsStatsPage');
const ReadCommunicationPage      = page(() => import('./views/Public/ReadCommunicationPage'), 'ReadCommunicationPage');
const CtaTrackingPage            = page(() => import('./views/Public/CtaTrackingPage'), 'CtaTrackingPage');
const TaxCalendarPage            = page(() => import('./views/Accounting/TaxCalendarPage'), 'TaxCalendarPage');
const TaxReportPage              = page(() => import('./views/Accounting/TaxReportPage'), 'TaxReportPage');
const AccountingMessagesPage     = page(() => import('./views/Accounting/AccountingMessagesPage'), 'AccountingMessagesPage');
const RolesPage                  = page(() => import('./views/Admin/RolesPage'), 'RolesPage');
const QuestionnaireSendStatsPage = page(() => import('./views/Questionnaires/QuestionnaireSendStatsPage'), 'QuestionnaireSendStatsPage');
const PublicFormPage             = page(() => import('./views/Public/PublicFormPage'), 'PublicFormPage');
const EmailSendStatsPage         = page(() => import('./views/Questionnaires/EmailSendStatsPage'), 'EmailSendStatsPage');
const WhatsAppPage               = page(() => import('./views/WhatsApp/WhatsAppPage'), 'WhatsAppPage');
const WhatsAppStatsPage          = page(() => import('./views/WhatsApp/WhatsAppStatsPage'), 'WhatsAppStatsPage');
const BulletinsPage              = page(() => import('./views/Bulletins/BulletinsPage'), 'BulletinsPage');
const BulletinEditorPage         = page(() => import('./views/Bulletins/BulletinEditorPage'), 'BulletinEditorPage');
const BulletinViewPage           = page(() => import('./views/Bulletins/BulletinViewPage'), 'BulletinViewPage');
const BulletinStatsPage          = page(() => import('./views/Bulletins/BulletinStatsPage'), 'BulletinStatsPage');
const ManualPage                 = page(() => import('./views/Manual/ManualPage'), 'ManualPage');
const OffboardingPage            = page(() => import('./views/Offboarding/OffboardingPage'), 'OffboardingPage');


/** Redirects authenticated users to their role's home page */
function HomeRedirect() {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  return <Navigate to={isAccountingHome(role) ? '/contabilidad' : '/dashboard'} replace />;
}

const isAccountingHome = (role: AppRole | null) => !!role && ACCOUNTING_HOME_ROLES.includes(role);

/** Renders children only if role can access; otherwise redirects to role home */
function RoleRoute({ children, path }: { children: React.ReactNode; path: string }) {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  const contabilidadRoutes = role === 'revisor_fiscal'
    ? ['/contabilidad', '/contabilidad/informe', '/manual']
    : ['/contabilidad', '/contabilidad/informe', '/contabilidad/mensajes', '/manual'];
  if (isAccountingHome(role) && !contabilidadRoutes.includes(path)) return <Navigate to="/contabilidad" replace />;
  return <>{children}</>;
}

/** Admins y Talento Humano — resto redirigido a su home */
function BulletinsRoute({ children }: { children: React.ReactNode }) {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  if (role !== 'admin' && role !== 'talento_humano') return <Navigate to={isAccountingHome(role) ? '/contabilidad' : '/dashboard'} replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role, loading: roleLoading } = useAppRole();
  if (roleLoading) return <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>;
  if (role !== 'admin') return <Navigate to={role === 'talento_humano' ? '/talento-humano/control' : '/contabilidad'} replace />;
  return <>{children}</>;
}

function App() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader fullScreen />}>
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
            : isAuthenticated ? <AdminRoute><MainLayout><UsersPage /></MainLayout></AdminRoute>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/talento-humano/control"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <BulletinsRoute><MainLayout><HrControlPage /></MainLayout></BulletinsRoute>
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
          path="/proyectos/:id/estadisticas"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><AnalyticalAccountStatsPage /></MainLayout>
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
          path="/empresas/:companyId"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><CompanyWorkforcePage /></MainLayout>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/configuraciones/empresas"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><CompanySettingsPage /></MainLayout>
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
          path="/estadisticas-campanas-correo"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><CommunicationsStatsPage /></MainLayout>
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
            : isAuthenticated ? <RoleRoute path="/contabilidad/mensajes"><MainLayout><AccountingMessagesPage /></MainLayout></RoleRoute>
            : <Navigate to="/login" />
          }
        />

        <Route
          path="/offboarding"
          element={
            loading ? null
            : !isAuthenticated ? <Navigate to="/login" />
            : <BulletinsRoute><MainLayout><OffboardingPage /></MainLayout></BulletinsRoute>
          }
        />

        <Route
          path="/manual"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><RoleRoute path="/manual"><ManualPage /></RoleRoute></MainLayout>
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
          path="/estadisticas-whatsapp"
          element={
            loading ? null
            : isAuthenticated ? <MainLayout><WhatsAppStatsPage /></MainLayout>
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
      </Suspense>
      <AssistantCompanion />
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
