import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AgentPage } from './pages/AgentPage';
import { DashboardPage } from './pages/DashboardPage';
import { PullRequestDetailPage } from './pages/PullRequestDetailPage';
import { PullRequestsPage } from './pages/PullRequestsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="pull-requests" element={<PullRequestsPage />} />
        <Route path="pull-requests/:owner/:repo/:number" element={<PullRequestDetailPage />} />
        <Route path="workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
        <Route path="agents/:agentId" element={<AgentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
