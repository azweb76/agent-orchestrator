import { describe, expect, it } from 'vitest';
import { CHAT_EMPTY_STATE_DESCRIPTION } from './chatEmptyState';

describe('CHAT_EMPTY_STATE_DESCRIPTION', () => {
  it('describes stacked sessions without a new-session control', () => {
    expect(CHAT_EMPTY_STATE_DESCRIPTION).toMatch(/one after another/);
    expect(CHAT_EMPTY_STATE_DESCRIPTION).not.toMatch(/\+/);
    expect(CHAT_EMPTY_STATE_DESCRIPTION).not.toMatch(/New session/i);
  });
});
