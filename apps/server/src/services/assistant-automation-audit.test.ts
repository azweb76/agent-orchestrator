import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPollAddressReviewBlocked } from './assistant-automation-audit.js';

test('formatPollAddressReviewBlocked mentions worktree busy', () => {
  const text = formatPollAddressReviewBlocked({
    owner: 'acme',
    repo: 'demo',
    number: 12,
    agentId: 'ag-1',
    reason: 'worktree_busy',
  });
  assert.match(text, /GitHub poll · Address review/);
  assert.match(text, /acme\/demo#12/);
  assert.match(text, /worktree is busy/);
  assert.match(text, /ag-1/);
});
