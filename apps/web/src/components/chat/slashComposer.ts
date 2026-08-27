import {
  CONTEXT_SLASH_COMMANDS,
  LOCAL_SLASH_COMMANDS,
  type SlashCommand,
} from '@agent-orchestrator/shared';

export const FALLBACK_SLASH_COMMANDS: SlashCommand[] = [
  ...LOCAL_SLASH_COMMANDS,
  ...CONTEXT_SLASH_COMMANDS,
];

export const CONTEXT_SLASH_CHIP_COMMANDS = ['/diff', '/test', '/pr', '/code-review'] as const;

export function resolveSlashCommand(commands: SlashCommand[], text: string): SlashCommand | undefined {
  const token = text.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token?.startsWith('/')) return undefined;
  const exact = commands.find((item) => item.command.toLowerCase() === token);
  if (exact) return exact;
  return commands.find((item) => item.aliases?.some((alias) => alias.toLowerCase() === token));
}

export function filterSlashCommands(commands: SlashCommand[], draft: string): SlashCommand[] {
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
