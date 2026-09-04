import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentMemory, AgentMemoryKind, AgentMemoryScope } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';

interface AgentMemoryPanelProps {
  agentId: string;
  workspaceId: string;
  archived: boolean;
  enabled: boolean;
}

function scopeLabel(scope: AgentMemoryScope): string {
  if (scope === 'global') return 'Global';
  if (scope === 'workspace') return 'Workspace';
  return 'Agent';
}

function kindColor(kind: AgentMemoryKind): 'default' | 'info' | 'warning' {
  if (kind === 'preference') return 'info';
  if (kind === 'lesson') return 'warning';
  return 'default';
}

export function AgentMemoryPanel({
  agentId,
  workspaceId,
  archived,
  enabled,
}: AgentMemoryPanelProps) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<AgentMemoryScope>('agent');
  const [kind, setKind] = useState<AgentMemoryKind>('fact');
  const [key, setKey] = useState('');
  const [content, setContent] = useState('');

  const memoriesQuery = useQuery({
    queryKey: ['memories', agentId],
    queryFn: () => api.listMemories(agentId),
    enabled: enabled && Boolean(agentId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createMemory(agentId, {
        scope,
        workspaceId: scope === 'workspace' ? workspaceId : undefined,
        agentId: scope === 'agent' ? agentId : undefined,
        kind,
        key,
        content,
      }),
    onSuccess: () => {
      setKey('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['memories', agentId] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (memory: AgentMemory) =>
      api.updateMemory(agentId, memory.id, {
        status: memory.status === 'active' ? 'archived' : 'active',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories', agentId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: string) => api.deleteMemory(agentId, memoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memories', agentId] }),
  });

  const memories = memoriesQuery.data ?? [];
  const activeCount = useMemo(
    () => memories.filter((item) => item.status === 'active').length,
    [memories],
  );

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, sm: 2 }, height: '100%', overflow: 'auto' }}>
      <Stack spacing={0.5}>
        <Typography variant="h6">Memory</Typography>
        <Typography variant="body2" color="text.secondary">
          Short durable notes injected into Claude runs for this agent (plus matching workspace /
          global notes). Prefer skills or CLAUDE.md for standing process; use memory for
          preferences and facts. {activeCount} active.
        </Typography>
      </Stack>

      {memoriesQuery.error ? (
        <Alert severity="error">{(memoriesQuery.error as Error).message}</Alert>
      ) : null}

      {!archived ? (
        <Stack
          spacing={1.5}
          sx={{
            p: 1.5,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1.5,
            bgcolor: 'ao.surface.inset',
          }}
        >
          <Typography variant="subtitle2">Add memory</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Scope</InputLabel>
              <Select
                label="Scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as AgentMemoryScope)}
              >
                <MenuItem value="agent">Agent</MenuItem>
                <MenuItem value="workspace">Workspace</MenuItem>
                <MenuItem value="global">Global</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Kind</InputLabel>
              <Select
                label="Kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as AgentMemoryKind)}
              >
                <MenuItem value="preference">Preference</MenuItem>
                <MenuItem value="lesson">Lesson</MenuItem>
                <MenuItem value="fact">Fact</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Key"
              placeholder="pref.tests"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              sx={{ flex: 1 }}
            />
          </Stack>
          <TextField
            size="small"
            label="Content"
            placeholder="Prefer vitest over jest in this repo"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            multiline
            minRows={2}
          />
          {createMutation.error ? (
            <Alert severity="error">{(createMutation.error as Error).message}</Alert>
          ) : null}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ControlTooltip title="Save this note for future Claude runs">
              <Button
                variant="contained"
                disabled={!key.trim() || !content.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Save memory
              </Button>
            </ControlTooltip>
          </Box>
        </Stack>
      ) : null}

      {memories.length === 0 ? (
        <EmptyState
          title="No memories yet"
          description="Add a preference or fact that should follow this agent across sessions."
        />
      ) : (
        <Stack spacing={1}>
          {memories.map((memory) => (
            <Stack
              key={memory.id}
              spacing={0.75}
              sx={{
                p: 1.25,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                opacity: memory.status === 'archived' ? 0.65 : 1,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Chip size="small" label={scopeLabel(memory.scope)} />
                <Chip size="small" color={kindColor(memory.kind)} label={memory.kind} />
                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>
                  {memory.key}
                </Typography>
                {memory.status === 'archived' ? (
                  <Chip size="small" label="archived" variant="outlined" />
                ) : null}
              </Stack>
              <Typography variant="body2">{memory.content}</Typography>
              {!archived ? (
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => archiveMutation.mutate(memory)}>
                    {memory.status === 'active' ? 'Archive' : 'Restore'}
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => deleteMutation.mutate(memory.id)}
                  >
                    Delete
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
