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




function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública para responder cuestionarios */}
        <Route path="/responder/:token" element={<AnswerQuestionnairePage />} />

        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />}
        />

        <Route
          path="/dashboard"
          element={
            isAuthenticated ? (
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
            isAuthenticated ? (
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
            isAuthenticated ? (
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
            isAuthenticated ? (
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
            isAuthenticated ? (
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
            isAuthenticated ? (
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
            isAuthenticated ? (
              <MainLayout>
                <UsersSearchPage />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          } />

          <Route path="/exportador"
        element={
            isAuthenticated ? (
              <MainLayout>
                <ExportQueueTable />
              </MainLayout>
            ) : (
              <Navigate to="/login" />
            )
          } />

        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />}
        />

        
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;