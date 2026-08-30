import { describe, expect, it } from 'vitest';
import {
  addCustomAllowedToolPattern,
  formatAllowedToolsList,
  parseAllowedToolsList,
  removeAllowedToolEntry,
  sanitizeAgentTaskAllowedTools,
  setAllSelectableAllowedTools,
  toggleBareAllowedTool,
} from '@agent-orchestrator/shared';

describe('allowed tools helpers', () => {
  it('parses and formats comma-separated lists', () => {
    expect(parseAllowedToolsList('Read, Bash(git *), Glob')).toEqual([
      'Read',
      'Bash(git *)',
      'Glob',
    ]);
    expect(formatAllowedToolsList(['Read', 'Read', ' Bash(git *) '])).toBe('Read,Bash(git *)');
  });

  it('toggles bare tools without dropping custom patterns', () => {
    const withBash = toggleBareAllowedTool('Read,Bash(git *)', 'Bash', true);
    expect(parseAllowedToolsList(withBash)).toEqual(['Read', 'Bash', 'Bash(git *)']);
    expect(toggleBareAllowedTool(withBash, 'Bash', false)).toBe('Read,Bash(git *)');
  });

  it('adds and removes custom patterns', () => {
    expect(addCustomAllowedToolPattern('Read', 'Bash(git *)')).toBe('Read,Bash(git *)');
    expect(addCustomAllowedToolPattern('Read', 'AskUserQuestion')).toBe('Read');
    expect(removeAllowedToolEntry('Read,Bash(git *)', 'Bash(git *)')).toBe('Read');
  });

  it('all selects every non-interactive catalog tool', () => {
    const all = setAllSelectableAllowedTools();
    expect(all.includes('Bash')).toBe(true);
    expect(all.includes('Read')).toBe(true);
    expect(all.includes('AskUserQuestion')).toBe(false);
    expect(all.includes('ExitPlanMode')).toBe(false);
  });

  it('sanitize strips interactive tools but keeps patterns', () => {
    expect(
      sanitizeAgentTaskAllowedTools('Read,AskUserQuestion,Bash(git *),ExitPlanMode'),
    ).toBe('Read,Bash(git *)');
  });
});
