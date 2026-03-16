import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { MCPServersPage } from './pages/MCPServersPage';
import { SkillsPage } from './pages/SkillsPage';
import { TemplatePickerPage } from './pages/TemplatePickerPage';
import { SkillConfigPage } from './pages/SkillConfigPage';
import { BillingPage } from './pages/BillingPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { CredentialIntakePage } from './pages/CredentialIntakePage';
import { OperatorDashboard } from './pages/OperatorDashboard';
import { OperatorCustomerDetail } from './pages/OperatorCustomerDetail';
import { useAuthStore } from './store/authStore';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
}

function OperatorRoute({ children }: { children: React.ReactNode }) {
  const { token, isOperator } = useAuthStore((state) => ({ token: state.token, isOperator: state.isOperator }));
  if (!token) return <Navigate to="/login" />;
  if (!isOperator) return <Navigate to="/skills" />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/chat"
          element={
            <PrivateRoute>
              <ChatPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SettingsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/mcp"
          element={
            <PrivateRoute>
              <MCPServersPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/skills"
          element={
            <PrivateRoute>
              <SkillsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/skills/:typeId/templates"
          element={
            <PrivateRoute>
              <TemplatePickerPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/skills/:typeId/templates/:templateId/configure/:userSkillId"
          element={
            <PrivateRoute>
              <SkillConfigPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <PrivateRoute>
              <BillingPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/change-password"
          element={
            <PrivateRoute>
              <ChangePasswordPage />
            </PrivateRoute>
          }
        />
        {/* Public onboarding intake — no auth required */}
        <Route path="/onboard/:token" element={<CredentialIntakePage />} />

        {/* Operator routes — requires isOperator */}
        <Route
          path="/operator"
          element={
            <OperatorRoute>
              <OperatorDashboard />
            </OperatorRoute>
          }
        />
        <Route
          path="/operator/customers/:orgId"
          element={
            <OperatorRoute>
              <OperatorCustomerDetail />
            </OperatorRoute>
          }
        />

        <Route path="/" element={<Navigate to="/skills" />} />
      </Routes>
    </BrowserRouter>
  );
}
