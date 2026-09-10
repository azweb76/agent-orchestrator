import { Box, Stack } from '@mui/material';
import { brainCreatePrompt } from '@agent-orchestrator/shared';
import { BrainCopilot } from './BrainCopilot';
import { BrainLibraryChangePanel } from './BrainLibraryChangePanel';
import type { BrainChangeSetApi } from './useBrainChangeSet';

/**
 * Copilot tab: the chat plus the pending-changes review panel.
 *
 * Rendered even when another tab is active (hidden by the caller) because unmounting
 * `BrainCopilot` aborts its SSE request, which makes the server abort the turn.
 */
export function BrainCopilotPanel({ copilot }: { copilot: BrainChangeSetApi }) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2.5}
      sx={{ alignItems: 'stretch', minHeight: { md: 640 } }}
    >
      <Box sx={{ flex: 1.2, minWidth: 0, display: 'flex' }}>
        <BrainCopilot
          kind={copilot.copilotKind}
          createPrompt={brainCreatePrompt(copilot.copilotKind)}
          streaming={copilot.streaming}
          onStreamingChange={copilot.setStreaming}
          pendingSend={copilot.pendingSend}
          onPendingConsumed={copilot.consumePendingSend}
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          alignSelf: 'flex-start',
          width: '100%',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: { xs: 2, sm: 2.5 },
          bgcolor: 'background.paper',
        }}
      >
        <BrainLibraryChangePanel
          changeSet={copilot.changeSet}
          accepting={copilot.accepting}
          error={copilot.saveError}
          lockedTaskName={copilot.lockedTaskName}
          builtInFollowUp={copilot.builtInFollowUp}
          onSelect={copilot.select}
          onUndo={copilot.undo}
          onChangeFile={copilot.changeFile}
          onDirty={copilot.markDirty}
          onAccept={copilot.accept}
        />
      </Box>
    </Stack>
  );
}
