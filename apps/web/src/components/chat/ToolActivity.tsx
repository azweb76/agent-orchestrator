import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import type { ReactNode } from 'react';
import { type ToolActivityItem } from '@agent-orchestrator/shared';
import { formatDurationMs, subagentTypeLabel, toolActionLabel } from './toolPresentation';

export type { StreamPart, ToolActivityItem } from '@agent-orchestrator/shared';
export {
  activeToolItem,
  appendStreamText,
  applyStreamEvent,
  coalesceTimelineText,
  extractToolActivity,
  isSubagentItem,
  runningSubagentItems,
} from '@agent-orchestrator/shared';

function pickActive(items: ToolActivityItem[]): ToolActivityItem | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!;
    if (item.status === 'running') return item;
  }
  return items[items.length - 1];
}

function toolIcon(name: string, taskType?: string): ReactNode {
  if (taskType === 'local_bash' || name === 'Bash' || name === 'BashOutput' || name === 'KillShell') {
    return <TerminalIcon sx={{ fontSize: 16 }} />;
  }
  if (name === 'Task' || name === 'Agent' || taskType === 'local_agent') {
    return <SmartToyOutlinedIcon sx={{ fontSize: 16 }} />;
  }
  switch (name) {
    case 'Read':
      return <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />;
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return <EditOutlinedIcon sx={{ fontSize: 16 }} />;
    case 'Glob':
    case 'Grep':
    case 'WebSearch':
      return <SearchOutlinedIcon sx={{ fontSize: 16 }} />;
    case 'WebFetch':
      return <LanguageOutlinedIcon sx={{ fontSize: 16 }} />;
    default:
      return <BuildOutlinedIcon sx={{ fontSize: 16 }} />;
  }
}

function subagentTitle(item: ToolActivityItem): string {
  const description = item.task?.description?.trim();
  if (description) return description;
  const typeLabel = subagentTypeLabel(item.task?.subagentType);
  if (typeLabel) return typeLabel;
  if (item.task?.taskType === 'local_bash') return item.detail?.trim() || 'Background command';
  return toolActionLabel(item.name);
}

function subagentActivity(item: ToolActivityItem): string | undefined {
  const lastTool = item.task?.lastToolName;
  const detail = item.detail?.trim();
  const title = item.task?.description?.trim();
  if (detail && detail !== title) return detail;
  if (lastTool) return toolActionLabel(lastTool);
  return undefined;
}

function subagentMeta(item: ToolActivityItem): string | undefined {
  const parts: string[] = [];
  const duration = formatDurationMs(item.task?.durationMs);
  if (duration) parts.push(duration);
  if (typeof item.task?.toolUses === 'number' && item.task.toolUses > 0) {
    parts.push(`${item.task.toolUses} tool${item.task.toolUses === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function ThinkingIndicator() {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5, pl: 0.25 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }} aria-hidden>
        {[0, 1, 2].map((index) => (
          <Box
            key={index}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'secondary.main',
              animation: 'ao-think 1.15s ease-in-out infinite',
              animationDelay: `${index * 0.16}s`,
              '@keyframes ao-think': {
                '0%, 80%, 100%': { opacity: 0.28, transform: 'translateY(0)' },
                '40%': { opacity: 1, transform: 'translateY(-2px)' },
              },
            }}
          />
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Thinking
      </Typography>
    </Stack>
  );
}

function ActivityIcon({
  running,
  children,
}: {
  running: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        width: 28,
        height: 28,
        borderRadius: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'info.main',
        bgcolor: 'rgba(139,164,255,0.12)',
        animation: running ? 'ao-tool-pulse 1.6s ease-in-out infinite' : undefined,
        '@keyframes ao-tool-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(139,164,255,0.35)' },
          '50%': { boxShadow: '0 0 0 5px rgba(139,164,255,0)' },
        },
      }}
      aria-hidden
    >
      {children}
    </Box>
  );
}

/**
 * Single in-place activity card for the active (non-subagent) tool.
 * Does not accumulate a list of past tool events in the chat log.
 */
export function ToolProgressBar({ items }: { items: ToolActivityItem[] }) {
  const active = pickActive(items);
  const doneCount = items.filter((item) => item.status === 'done').length;
  const label = active ? toolActionLabel(active.name) : 'Working';
  const detail = active?.detail?.trim();
  const running = active?.status === 'running';

  return (
    <Box
      sx={{
        mt: 1,
        px: 1.5,
        py: 1.15,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'rgba(139,164,255,0.28)',
        bgcolor: 'rgba(139,164,255,0.06)',
        maxWidth: 560,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <ActivityIcon running={running}>
          {active ? toolIcon(active.name, active.task?.taskType) : <BuildOutlinedIcon sx={{ fontSize: 16 }} />}
        </ActivityIcon>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {label}
            </Typography>
            {doneCount > 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {doneCount} done
              </Typography>
            ) : null}
          </Stack>
          {detail ? (
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              title={detail}
              sx={{
                mt: 0.15,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11.5,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {detail}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      <LinearProgress
        color="info"
        sx={{
          mt: 1.1,
          height: 2.5,
          borderRadius: 1,
          bgcolor: 'rgba(124,156,255,0.14)',
        }}
      />
    </Box>
  );
}

function SubagentRow({ item }: { item: ToolActivityItem }) {
  const running = item.status === 'running';
  const title = subagentTitle(item);
  const activity = subagentActivity(item);
  const meta = subagentMeta(item);
  const typeLabel = subagentTypeLabel(item.task?.subagentType);
  const failed = item.task?.outcome === 'failed';

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.05,
        borderRadius: 2,
        border: '1px solid',
        borderColor: failed
          ? 'rgba(244,162,97,0.35)'
          : 'rgba(94,234,212,0.28)',
        bgcolor: failed ? 'rgba(244,162,97,0.06)' : 'rgba(94,234,212,0.06)',
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: failed ? 'warning.main' : 'secondary.main',
            bgcolor: failed ? 'rgba(244,162,97,0.12)' : 'rgba(94,234,212,0.12)',
            animation: running ? 'ao-subagent-pulse 1.6s ease-in-out infinite' : undefined,
            '@keyframes ao-subagent-pulse': {
              '0%, 100%': { boxShadow: '0 0 0 0 rgba(94,234,212,0.35)' },
              '50%': { boxShadow: '0 0 0 5px rgba(94,234,212,0)' },
            },
          }}
          aria-hidden
        >
          {toolIcon(item.name, item.task?.taskType)}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography
              variant="body2"
              title={title}
              sx={{
                fontWeight: 600,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {typeLabel || (item.task?.taskType === 'local_bash' ? 'Bash' : running ? 'Running' : failed ? 'Failed' : 'Done')}
            </Typography>
          </Stack>
          {activity ? (
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              title={activity}
              sx={{
                mt: 0.15,
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: 11.5,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activity}
            </Typography>
          ) : null}
          {meta ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.1 }}>
              {meta}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      {running ? (
        <LinearProgress
          color="secondary"
          sx={{
            mt: 1,
            height: 2.5,
            borderRadius: 1,
            bgcolor: 'rgba(94,234,212,0.14)',
          }}
        />
      ) : null}
    </Box>
  );
}

/**
 * One card per Task/Agent (and background bash) so parallel subagents stay visible.
 */
export function SubagentActivityList({ items }: { items: ToolActivityItem[] }) {
  if (items.length === 0) return null;
  const runningCount = items.filter((item) => item.status === 'running').length;

  return (
    <Stack spacing={0.85} sx={{ mt: 1, maxWidth: 560 }} aria-label="Running subagents">
      {items.length > 1 ? (
        <Typography variant="caption" color="text.secondary">
          {runningCount} running
        </Typography>
      ) : null}
      {items.map((item) => (
        <SubagentRow key={item.id} item={item} />
      ))}
    </Stack>
  );
}