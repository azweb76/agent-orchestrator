import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTO_WRITE_TEMPLATE_TOOLS,
  schedulePolicyAllowsWrite,
} from '@agent-orchestrator/shared';

test('respond_permission is never auto-confirmable by a schedule policy', () => {
  assert.equal(AUTO_WRITE_TEMPLATE_TOOLS.has('respond_permission'), false);
  const decision = schedulePolicyAllowsWrite('auto_write_templates', 'respond_permission', 'write');
  assert.equal(decision.autoConfirm, false);
  assert.equal(decision.allow, false);
});

test('auto_write_templates still auto-confirms the intended template tools', () => {
  for (const tool of ['start_agent_session', 'create_agent_pull_request', 'dismiss_work_item']) {
    const decision = schedulePolicyAllowsWrite('auto_write_templates', tool, 'write');
    assert.equal(decision.allow, true, tool);
    assert.equal(decision.autoConfirm, true, tool);
  }
});

test('read tools are unaffected by policy', () => {
  const decision = schedulePolicyAllowsWrite('auto_write_templates', 'list_agents', 'read');
  assert.equal(decision.allow, true);
  assert.equal(decision.autoConfirm, false);
});

test('the restrictive policies still block writes entirely', () => {
  for (const policy of ['notify_only', 'propose_in_chat'] as const) {
    const decision = schedulePolicyAllowsWrite(policy, 'start_agent_session', 'write');
    assert.equal(decision.allow, false, policy);
  }
});
