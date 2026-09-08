import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Paper, Stack, Tab, Tabs } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useSseConnectionState } from '../api/events';
import { SSE_FALLBACK_ACTIVE_POLL_MS } from '../api/ssePolling';
import { ArchiveAgentDialog } from '../components/ArchiveAgentDialog';
import { AgentChangesPanel } from '../components/changes/AgentChangesPanel';
import { UndoFilesDialog } from '../components/changes/UndoFilesDialog';
import type { FilesViewMode } from '../components/changes/filesViewMode';
import { AgentMemoryPanel } from '../components/agent/AgentMemoryPanel';
import { ChatPanel } from '../components/chat/ChatPanel';
import type { ChatTemplateKickoffRequest } from '../components/chat/useChatTemplateKickoff';
import type { AgentPrKickoffTemplate } from '../components/agent/agentPrStatusSummary';
import { AgentPageHeader } from './AgentPageHeader';
import { CommitChangesDialog } from './CommitChangesDialog';
import { CreatePullRequestDialog } from './CreatePullRequestDialog';
import type { AgentLocationState } from './agentPageTypes';
import { useAgentPageMutations } from './useAgentPageMutations';

export function AgentPage() {
  const { agentId = '' } = useParams();
  return <AgentPageContent key={agentId} agentId={agentId} />;
}

function countDiffFiles(patch: string | undefined): number {
  if (!patch?.trim()) return 0;
  return (patch.match(/^diff --git /gm) ?? []).length;
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
  const [focusSessionId] = useState(() => locationState?.sessionId);
  const [tab, setTab] = useState(0);
  const [prKickoff, setPrKickoff] = useState<ChatTemplateKickoffRequest | null>(null);
  const prKickoffNonce = useRef(0);
  const [mode, setMode] = useState<FilesViewMode>('pending');
  const [prOpen, setPrOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitPush, setCommitPush] = useState(true);
  const [commitHasPending, setCommitHasPending] = useState(true);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoPaths, setUndoPaths] = useState<string[]>([]);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(true);
  const sseState = useSseConnectionState();

  const {
    archiveMutation,
    stopMutation,
    unarchiveMutation,
    commitMutation,
    createPrMutation,
    discardMutation,
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

  const pendingDiffQuery = useQuery({
    queryKey: ['diff', agentId, 'pending'],
    queryFn: () => api.getDiff(agentId, 'pending'),
    enabled: Boolean(agentId) && !agentQuery.data?.archivedAt,
    staleTime: 10_000,
  });
  const pendingFileCount = countDiffFiles(pendingDiffQuery.data?.patch);

  const openCommitDialog = (opts: { push: boolean; hasPendingChanges: boolean }) => {
    commitMutation.reset();
    setCommitMessage('');
    setCommitPush(opts.push);
    setCommitHasPending(opts.hasPendingChanges);
    setCommitOpen(true);
  };

  const openCreateDraftPr = () => {
    createPrMutation.reset();
    setPrTitle(agentQuery.data?.name ?? '');
    setPrBody('');
    setPrDraft(true);
    setPrOpen(true);
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
        stopPending={stopMutation.isPending}
        onArchive={() => {
          archiveMutation.reset();
          setArchiveOpen(true);
        }}
        onUnarchive={() => unarchiveMutation.mutate()}
        onStop={() => stopMutation.mutate()}
        onCommit={openCommitDialog}
        onCreateDraftPr={openCreateDraftPr}
        onStartPrKickoff={(template: AgentPrKickoffTemplate) => {
          prKickoffNonce.current += 1;
          setPrKickoff({ template, nonce: prKickoffNonce.current });
          setTab(0);
        }}
      />

      {stopMutation.error && (
        <Alert severity="error" onClose={() => stopMutation.reset()}>
          {(stopMutation.error as Error).message}
        </Alert>
      )}

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
          <Tab
            label={pendingFileCount > 0 ? `Files (${pendingFileCount})` : 'Files'}
            sx={{ minHeight: 40, py: 1 }}
          />
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
            templateKickoff={prKickoff}
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
            mode={mode}
            onModeChange={setMode}
            enabled={tab === 1}
            archived={archived}
            onCommit={() => openCommitDialog({ push: false, hasPendingChanges: true })}
            onCommitAndPush={() => openCommitDialog({ push: true, hasPendingChanges: true })}
            onUndoFiles={(paths) => {
              discardMutation.reset();
              setUndoPaths(paths);
              setUndoOpen(true);
            }}
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
        onCreated={(pr) => {
          setPrOpen(false);
          setPrTitle('');
          setPrBody('');
          if (pr.htmlUrl) window.open(pr.htmlUrl, '_blank', 'noopener,noreferrer');
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

      <UndoFilesDialog
        open={undoOpen}
        paths={undoPaths}
        loading={discardMutation.isPending}
        error={discardMutation.error ? (discardMutation.error as Error).message : null}
        onCancel={() => {
          if (discardMutation.isPending) return;
          setUndoOpen(false);
          discardMutation.reset();
        }}
        onConfirm={() => {
          discardMutation.mutate(undoPaths, {
            onSuccess: () => {
              setUndoOpen(false);
              setUndoPaths([]);
            },
          });
        }}
      />
    </Stack>
  );
}
