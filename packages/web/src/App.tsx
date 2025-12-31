import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { MCPServersPage } from './pages/MCPServersPage';
import { WorkflowBuilderPage } from './pages/WorkflowBuilderPage';
import { useAuthStore } from './store/authStore';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
          path="/workflows/builder"
          element={
            <PrivateRoute>
              <WorkflowBuilderPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/workflows/:id/edit"
          element={
            <PrivateRoute>
              <WorkflowBuilderPage />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/chat" />} />
      </Routes>
    </BrowserRouter>
  );
}
