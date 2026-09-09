import { describe, expect, it } from 'vitest';
import { filterSlashCommands, resolveSlashCommand } from './composer/slashFilter';
import type { SlashCommandItem } from './types';

const commands: SlashCommandItem[] = [
  { id: 'clear', command: '/clear', kind: 'local', description: 'Clear' },
  { id: 'diff', command: '/diff', aliases: ['/d'], kind: 'context', description: 'Diff' },
];

describe('slashFilter', () => {
  it('filters by prefix and aliases', () => {
    expect(filterSlashCommands(commands, '/c').map((item) => item.id)).toEqual(['clear']);
    expect(filterSlashCommands(commands, '/d').map((item) => item.id)).toEqual(['diff']);
  });

  it('resolves exact commands', () => {
    expect(resolveSlashCommand(commands, '/clear extra')?.id).toBe('clear');
    expect(resolveSlashCommand(commands, '/d')?.id).toBe('diff');
  });
});
