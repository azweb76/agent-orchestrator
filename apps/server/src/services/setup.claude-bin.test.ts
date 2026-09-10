import assert from 'node:assert/strict';
import test from 'node:test';
import { assertConfigurableClaudeBin } from './setup.js';
import { isAllowedSkillFile } from './personal-skill-install.js';

const DETECTED = ['claude', '/opt/homebrew/bin/claude'];

test('a detected candidate is accepted verbatim', () => {
  for (const bin of DETECTED) {
    assert.doesNotThrow(() => assertConfigurableClaudeBin(bin, DETECTED), bin);
  }
});

test('an absolute path outside the detected set is allowed', () => {
  assert.doesNotThrow(() =>
    assertConfigurableClaudeBin('/Users/someone/.local/bin/claude', DETECTED),
  );
});

test('a relative path is rejected', () => {
  for (const bin of ['claude-custom', './claude', '../bin/claude', 'bin/claude']) {
    assert.throws(() => assertConfigurableClaudeBin(bin, DETECTED), /absolute path/, bin);
  }
});

test('shell metacharacters and whitespace are rejected', () => {
  for (const bin of [
    '/bin/sh -c id',
    '/usr/bin/claude;id',
    '/usr/bin/claude|tee',
    '/usr/bin/$(id)',
    '/usr/bin/claude`id`',
    '~/claude',
    '/usr/bin/cla*de',
  ]) {
    assert.throws(() => assertConfigurableClaudeBin(bin, DETECTED), /unsupported characters/, bin);
  }
});

test('isAllowedSkillFile accepts skill content and rejects everything else', () => {
  for (const file of ['SKILL.md', 'notes.markdown', 'data.json', 'conf.yaml', 'rows.csv']) {
    assert.equal(isAllowedSkillFile(file), true, file);
  }
  for (const file of [
    'install.sh',
    'run.js',
    'binary',
    'Makefile',
    '.bashrc',
    '.npmrc',
    'nested/.profile',
    'thing.py',
  ]) {
    assert.equal(isAllowedSkillFile(file), false, file);
  }
});

test('isAllowedSkillFile is case-insensitive on the extension', () => {
  assert.equal(isAllowedSkillFile('SKILL.MD'), true);
  assert.equal(isAllowedSkillFile('script.SH'), false);
});
