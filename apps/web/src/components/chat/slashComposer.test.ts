import { describe, expect, it } from 'vitest';
import type { SlashCommand } from '@agent-orchestrator/shared';
import { filterSlashCommands, resolveSlashCommand } from './slashComposer';

const commands: SlashCommand[] = [
  { command: '/diff', description: 'Attach the current diff', kind: 'context' },
  { command: '/test', description: 'Run tests', kind: 'prompt', aliases: ['/tests'] },
  { command: '/pr', description: 'Open a pull request', kind: 'context' },
];

describe('resolveSlashCommand', () => {
  it('resolves an exact command token', () => {
    expect(resolveSlashCommand(commands, '/diff please')?.command).toBe('/diff');
    expect(resolveSlashCommand(commands, '  /PR  ')?.command).toBe('/pr');
  });

  it('resolves aliases', () => {
    expect(resolveSlashCommand(commands, '/tests unit')?.command).toBe('/test');
  });

  it('returns undefined for non-commands and unknown commands', () => {
    expect(resolveSlashCommand(commands, 'plain text')).toBeUndefined();
    expect(resolveSlashCommand(commands, '/unknown')).toBeUndefined();
  });
});

describe('filterSlashCommands', () => {
  it('returns nothing unless the draft starts with a slash', () => {
    expect(filterSlashCommands(commands, 'hello')).toEqual([]);
  });

  it('filters by command prefix, including aliases', () => {
    expect(filterSlashCommands(commands, '/d').map((item) => item.command)).toEqual(['/diff']);
    expect(filterSlashCommands(commands, '/tests').map((item) => item.command)).toEqual(['/test']);
  });

  it('lists every command for a bare slash', () => {
    expect(filterSlashCommands(commands, '/')).toHaveLength(commands.length);
  });
});
