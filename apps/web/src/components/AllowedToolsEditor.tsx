import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  addCustomAllowedToolPattern,
  CLAUDE_CODE_TOOLS,
  CLAUDE_TOOL_CATEGORY_LABELS,
  getClaudeCodeTool,
  isBareAllowedToolEntry,
  parseAllowedToolsList,
  removeAllowedToolEntry,
  setAllSelectableAllowedTools,
  toggleBareAllowedTool,
  type ClaudeToolCategory,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from './ui/ControlTooltip';

const CATEGORY_ORDER: ClaudeToolCategory[] = [
  'files',
  'search',
  'shell',
  'web',
  'agents',
  'tasks',
  'session',
  'other',
];

export type AllowedToolsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown under the control; default explains blank → permission mode. */
  helperText?: string;
};

export function AllowedToolsEditor({
  value,
  onChange,
  disabled = false,
  helperText = 'Blank derives from permission mode. Patterns like Bash(git *) auto-approve matching calls only.',
}: AllowedToolsEditorProps) {
  const [customDraft, setCustomDraft] = useState('');
  const selected = useMemo(() => new Set(parseAllowedToolsList(value)), [value]);

  const customEntries = useMemo(
    () => parseAllowedToolsList(value).filter((entry) => !isBareAllowedToolEntry(entry)),
    [value],
  );

  const unknownBare = useMemo(
    () =>
      parseAllowedToolsList(value).filter(
        (entry) => isBareAllowedToolEntry(entry) && !getClaudeCodeTool(entry),
      ),
    [value],
  );

  const toolsByCategory = useMemo(() => {
    const map = new Map<ClaudeToolCategory, typeof CLAUDE_CODE_TOOLS>();
    for (const category of CATEGORY_ORDER) {
      map.set(
        category,
        CLAUDE_CODE_TOOLS.filter((tool) => tool.category === category),
      );
    }
    return map;
  }, []);

  const addCustom = () => {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    onChange(addCustomAllowedToolPattern(value, trimmed));
    setCustomDraft('');
  };

  return (
    <Stack spacing={1.25}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Typography variant="subtitle2">Allowed tools</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => onChange(setAllSelectableAllowedTools())}
          >
            All
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => onChange('')}
          >
            None
          </Button>
        </Stack>
      </Stack>

      <Box
        sx={{
          maxHeight: 280,
          overflow: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          px: 1.5,
          py: 1,
        }}
      >
        <Stack spacing={1.5}>
          {CATEGORY_ORDER.map((category) => {
            const tools = toolsByCategory.get(category) ?? [];
            if (tools.length === 0) return null;
            return (
              <Box key={category}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}
                >
                  {CLAUDE_TOOL_CATEGORY_LABELS[category]}
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: '1fr 1fr',
                      md: '1fr 1fr 1fr',
                    },
                    columnGap: 1,
                    rowGap: 0.25,
                  }}
                >
                  {tools.map((tool) => {
                    const checked = selected.has(tool.id);
                    const control = (
                      <FormControlLabel
                        sx={{ m: 0, alignItems: 'flex-start' }}
                        control={
                          <Checkbox
                            size="small"
                            checked={checked}
                            disabled={disabled || tool.interactive}
                            onChange={(e) =>
                              onChange(toggleBareAllowedTool(value, tool.id, e.target.checked))
                            }
                          />
                        }
                        label={
                          <Box sx={{ pt: 0.5 }}>
                            <Typography variant="body2" component="span">
                              {tool.label}
                            </Typography>
                            {tool.interactive ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block' }}
                              >
                                Always prompts
                              </Typography>
                            ) : null}
                          </Box>
                        }
                      />
                    );
                    const tip = tool.interactive
                      ? tool.description
                      : `${tool.description}${tool.patternHint ? ` · e.g. ${tool.patternHint}` : ''}`;
                    return (
                      <ControlTooltip
                        key={tool.id}
                        title={tip}
                        disabled={disabled || tool.interactive}
                      >
                        {control}
                      </ControlTooltip>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {(customEntries.length > 0 || unknownBare.length > 0) && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {[...unknownBare, ...customEntries].map((entry) => (
            <Chip
              key={entry}
              size="small"
              label={entry}
              onDelete={disabled ? undefined : () => onChange(removeAllowedToolEntry(value, entry))}
              variant="outlined"
            />
          ))}
        </Stack>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'flex-start' } }}
      >
        <TextField
          size="small"
          fullWidth
          label="Custom pattern"
          placeholder="Bash(git *), WebFetch(domain:github.com), …"
          value={customDraft}
          disabled={disabled}
          onChange={(e) => setCustomDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          helperText="Tool(specifier) rules for scoped auto-approve"
        />
        <Button
          variant="outlined"
          disabled={disabled || !customDraft.trim()}
          onClick={addCustom}
          sx={{ flexShrink: 0, mt: { sm: 0.5 } }}
        >
          Add
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        {helperText}
      </Typography>
    </Stack>
  );
}
