import { createContext, useContext } from 'react';

export interface CommandPaletteHandle {
  /** Open the app-wide command palette (same as pressing Cmd/Ctrl+K). */
  openPalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteHandle>({
  openPalette: () => undefined,
});

/** Access the command palette from any page rendered inside AppLayout. */
export function useCommandPalette(): CommandPaletteHandle {
  return useContext(CommandPaletteContext);
}

export const CommandPaletteProvider = CommandPaletteContext.Provider;
