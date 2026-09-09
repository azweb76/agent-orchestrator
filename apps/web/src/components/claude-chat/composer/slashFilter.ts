import type { SlashCommandItem } from '../types';

export function filterSlashCommands(commands: SlashCommandItem[], draft: string): SlashCommandItem[] {
  const token = draft.trim().split(/\s+/)[0] ?? '';
  if (!token.startsWith('/')) return [];
  const needle = token.toLowerCase();
  return commands
    .filter((item) => {
      if (item.command.toLowerCase().startsWith(needle)) return true;
      return item.aliases?.some((alias) => alias.toLowerCase().startsWith(needle)) ?? false;
    })
    .slice(0, 12);
}

export function resolveSlashCommand(
  commands: SlashCommandItem[],
  text: string,
): SlashCommandItem | undefined {
  const token = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token?.startsWith('/')) return undefined;
  const exact = commands.find((item) => item.command.toLowerCase() === token);
  if (exact) return exact;
  return commands.find((item) => item.aliases?.some((alias) => alias.toLowerCase() === token));
}
