import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AgentPage } from './pages/AgentPage';
import { DashboardPage } from './pages/DashboardPage';
import { FlightControllerPage } from './pages/FlightControllerPage';
import { PullRequestDetailPage } from './pages/PullRequestDetailPage';
import { PullRequestsPage } from './pages/PullRequestsPage';
import { TasksPage } from './pages/TasksPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="flight" element={<FlightControllerPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="pull-requests" element={<PullRequestsPage />} />
        <Route path="pull-requests/:owner/:repo/:number" element={<PullRequestDetailPage />} />
        <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="agents/:agentId" element={<AgentPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="profiles" element={<Navigate to="/tasks" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
