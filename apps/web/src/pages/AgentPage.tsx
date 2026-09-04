import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Paper, Stack, Tab, Tabs } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { AgentDiffScope } from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { useSseConnectionState } from '../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../api/ssePolling';
import { AgentPrActionOffers } from '../components/agent/AgentPrActionOffers';
import { AgentPrStatusStrip } from '../components/agent/AgentPrStatusStrip';
import { ArchiveAgentDialog } from '../components/ArchiveAgentDialog';
import { AgentChangesPanel } from '../components/changes/AgentChangesPanel';
import { AgentMemoryPanel } from '../components/agent/AgentMemoryPanel';
import { ChatPanel } from '../components/chat/ChatPanel';
import { AgentPageHeader } from './AgentPageHeader';
import { CommitChangesDialog } from './CommitChangesDialog';
import { CreatePullRequestDialog } from './CreatePullRequestDialog';
import type { AgentLocationState } from './agentPageTypes';
import { useAgentPageMutations } from './useAgentPageMutations';

export function AgentPage() {
  const { agentId = '' } = useParams();
  return <AgentPageContent key={agentId} agentId={agentId} />;
}

function AgentPageContent({ agentId }: { agentId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as AgentLocationState | null;
  const [initialPrompt] = useState(() => locationState?.initialPrompt?.trim() || undefined);
  const [initialImages] = useState(() => locationState?.initialImages);
  const [initialMentions] = useState(() => locationState?.initialMentions);
  const [initialTemplate] = useState(() => locationState?.sessionTemplate);
  const [focusAttention] = useState(() => locationState?.focusAttention);
  const [focusSessionId, setFocusSessionId] = useState(() => locationState?.sessionId);
  const [tab, setTab] = useState(0);
  const [diffScope, setDiffScope] = useState<AgentDiffScope>('pending');
  const [prOpen, setPrOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitPush, setCommitPush] = useState(true);
  const [commitHasPending, setCommitHasPending] = useState(true);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(true);
  const sseState = useSseConnectionState();

  const {
    archiveMutation,
    unarchiveMutation,
    commitMutation,
    createPrMutation,
    autopilotMutation,
  } = useAgentPageMutations(agentId);

  useEffect(() => {
    if (
      !locationState?.initialPrompt &&
      !locationState?.sessionTemplate &&
      !locationState?.focusAttention
    ) {
      return;
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [
    location.pathname,
    locationState?.initialPrompt,
    locationState?.sessionTemplate,
    locationState?.focusAttention,
    navigate,
  ]);

  const agentQuery = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId),
    enabled: Boolean(agentId),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (sseState === 'connected') return false;
      const data = query.state.data;
      if (!data) return false;
      if (data.status === 'running') return SSE_FALLBACK_ACTIVE_POLL_MS;
      if (data.sessions?.some((item) => item.status === 'running')) {
        return SSE_FALLBACK_ACTIVE_POLL_MS;
      }
      return false;
    },
  });

  const openCommitDialog = (hasPendingChanges: boolean) => {
    commitMutation.reset();
    setCommitMessage('');
    setCommitPush(true);
    setCommitHasPending(hasPendingChanges);
    setCommitOpen(true);
  };

  if (agentQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (agentQuery.error || !agentQuery.data) {
    return <Alert severity="error">{(agentQuery.error as Error)?.message ?? 'Agent not found'}</Alert>;
  }

  const agent = agentQuery.data;
  const archived = Boolean(agent.archivedAt);

  return (
    <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
      <AgentPageHeader
        agent={agent}
        archived={archived}
        archivePending={archiveMutation.isPending}
        unarchivePending={unarchiveMutation.isPending}
        autopilotPending={autopilotMutation.isPending}
        onArchive={() => {
          archiveMutation.reset();
          setArchiveOpen(true);
        }}
        onUnarchive={() => unarchiveMutation.mutate()}
        onCreatePr={() => setPrOpen(true)}
        onAutopilotChange={(enabled) => autopilotMutation.mutate(enabled)}
      />

      <AgentPrStatusStrip
        agent={agent}
        archived={archived}
        onSessionStarted={(sessionId) => {
          setFocusSessionId(sessionId);
          setTab(0);
        }}
      />
      <AgentPrActionOffers
        agent={agent}
        archived={archived}
        archivePending={archiveMutation.isPending}
        onArchive={() => {
          archiveMutation.reset();
          setArchiveOpen(true);
        }}
        onSessionStarted={(sessionId) => {
          setFocusSessionId(sessionId);
          setTab(0);
        }}
      />

      {unarchiveMutation.error && (
        <Alert severity="error" onClose={() => unarchiveMutation.reset()}>
          {(unarchiveMutation.error as Error).message}
        </Alert>
      )}

      <Paper
        sx={{
          p: 0,
          overflow: 'hidden',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            px: { xs: 0.5, sm: 1.5 },
            minHeight: 40,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Tab label="Chat" sx={{ minHeight: 40, py: 1 }} />
          <Tab label="Changes" sx={{ minHeight: 40, py: 1 }} />
          <Tab label="Memory" sx={{ minHeight: 40, py: 1 }} />
        </Tabs>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: tab === 0 ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ChatPanel
            agentId={agentId}
            active={tab === 0}
            archived={archived}
            initialPrompt={initialPrompt}
            initialImages={initialImages}
            initialMentions={initialMentions}
            initialTemplate={initialTemplate}
            focusAttention={focusAttention}
            focusSessionId={focusSessionId}
          />
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: tab === 1 ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <AgentChangesPanel
            agentId={agentId}
            worktreePath={agent.worktree.path}
            archived={archived}
            diffScope={diffScope}
            onDiffScopeChange={setDiffScope}
            onCommitClick={openCommitDialog}
            enabled={tab === 1}
          />
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: tab === 2 ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <AgentMemoryPanel
            agentId={agentId}
            workspaceId={agent.workspace.id}
            archived={archived}
            enabled={tab === 2}
          />
        </Box>
      </Paper>

      <CreatePullRequestDialog
        open={prOpen}
        title={prTitle}
        body={prBody}
        draft={prDraft}
        mutation={createPrMutation}
        onClose={() => setPrOpen(false)}
        onCreated={() => {
          setPrOpen(false);
          setPrTitle('');
          setPrBody('');
        }}
        onTitleChange={setPrTitle}
        onBodyChange={setPrBody}
        onDraftChange={setPrDraft}
      />

      <ArchiveAgentDialog
        open={archiveOpen}
        agentName={agent.name}
        worktreeName={agent.worktree.name}
        loading={archiveMutation.isPending}
        error={archiveMutation.error ? (archiveMutation.error as Error).message : null}
        onCancel={() => {
          setArchiveOpen(false);
          archiveMutation.reset();
        }}
        onConfirm={(deleteWorktree) => {
          archiveMutation.mutate(deleteWorktree, {
            onSuccess: () => setArchiveOpen(false),
          });
        }}
      />

      <CommitChangesDialog
        open={commitOpen}
        message={commitMessage}
        push={commitPush}
        hasPendingChanges={commitHasPending}
        mutation={commitMutation}
        onClose={() => {
          setCommitOpen(false);
          commitMutation.reset();
        }}
        onCommitted={() => {
          setCommitOpen(false);
          setCommitMessage('');
        }}
        onMessageChange={setCommitMessage}
        onPushChange={setCommitPush}
      />
    </Stack>
  );
}
