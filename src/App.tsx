import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
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




function App() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública — no requiere autenticación, carga inmediatamente */}
        <Route path="/responder/:token" element={<AnswerQuestionnairePage />} />

        <Route
          path="/login"
          element={
            loading ? <div className="min-h-screen flex items-center justify-center"><p>Cargando...</p></div>
            : isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />
          }
        />

        <Route
          path="/dashboard"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <DashboardPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/usuarios"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <UsersPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/questionarios"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <QuestionnairesPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* NUEVA RUTA DE NOTIFICACIONES */}
        <Route
          path="/notificaciones"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <NotificationsPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/rotacion-talento"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <RotationPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/chatbot"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <ChatWidget />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route path="/busqueda"
        element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <UsersSearchPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          } />

          <Route path="/exportador"
        element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <ExportQueueTable />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          } />

        <Route
          path="/proyectos"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <ProjectsPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/empresas"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <CompaniesPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/empresas/:companyId/analytics"
          element={
            !loading && isAuthenticated ? (
              <MainLayout>
                <CompanyAnalyticsPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="*"
          element={<Navigate to={loading ? "/login" : isAuthenticated ? "/dashboard" : "/login"} />}
        />

        
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;