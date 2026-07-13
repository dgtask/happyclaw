import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SetupPage } from './pages/SetupPage';
import { SetupProvidersPage } from './pages/SetupProvidersPage';
import { SetupChannelsPage } from './pages/SetupChannelsPage';
import { MemoryPage } from './pages/MemoryPage';
import { UsersPage } from './pages/UsersPage';
import { UsagePage } from './pages/UsagePage';
import { MonitorPage } from './pages/MonitorPage';
import { CapabilitiesPage } from './pages/CapabilitiesPage';
import { AuthGuard } from './components/auth/AuthGuard';
import { AppLayout } from './components/layout/AppLayout';
import { APP_BASE, shouldUseHashRouter } from './utils/url';
import { Toaster } from '@/components/ui/sonner';

const ChatPage = lazy(() =>
  import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })),
);
const TasksPage = lazy(() =>
  import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AgentProfilesPage = lazy(() =>
  import('./pages/AgentProfilesPage').then((m) => ({
    default: m.AgentProfilesPage,
  })),
);
const BillingPage = lazy(() => import('./pages/BillingPage'));

export function App() {
  const Router = shouldUseHashRouter() ? HashRouter : BrowserRouter;

  return (
    <Router basename={APP_BASE === '/' ? undefined : APP_BASE}>
      <Toaster position="top-right" richColors />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route
          path="/setup/providers"
          element={
            <AuthGuard>
              <SetupProvidersPage />
            </AuthGuard>
          }
        />
        <Route
          path="/setup/channels"
          element={
            <AuthGuard>
              <SetupChannelsPage />
            </AuthGuard>
          }
        />

        {/* Protected Routes with Layout */}
        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route
            path="/chat/:groupFolder?"
            element={
              <Suspense fallback={null}>
                <ChatPage />
              </Suspense>
            }
          />
          <Route path="/groups" element={<Navigate to="/chat" replace />} />
          <Route
            path="/agent-profiles"
            element={
              <Suspense fallback={null}>
                <AgentProfilesPage />
              </Suspense>
            }
          />
          <Route
            path="/tasks"
            element={
              <Suspense fallback={null}>
                <TasksPage />
              </Suspense>
            }
          />
          <Route
            path="/monitor"
            element={
              <AuthGuard requiredPermission="manage_system_config">
                <MonitorPage />
              </AuthGuard>
            }
          />
          <Route path="/usage" element={<UsagePage />} />
          <Route
            path="/billing"
            element={
              <Suspense fallback={null}>
                <BillingPage />
              </Suspense>
            }
          />
          <Route path="/memory" element={<MemoryPage />} />
          <Route
            path="/capabilities/:section?"
            element={<CapabilitiesPage />}
          />
          <Route
            path="/skills"
            element={<Navigate to="/capabilities/skills" replace />}
          />
          <Route
            path="/mcp-servers"
            element={<Navigate to="/capabilities/mcp" replace />}
          />
          <Route
            path="/plugins"
            element={<Navigate to="/capabilities/plugins" replace />}
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="/users"
            element={
              <AuthGuard
                requiredAnyPermissions={[
                  'manage_users',
                  'manage_invites',
                  'view_audit_log',
                ]}
              >
                <UsersPage />
              </AuthGuard>
            }
          />
        </Route>

        {/* Default redirect — go through AuthGuard to detect setup state */}
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Router>
  );
}
