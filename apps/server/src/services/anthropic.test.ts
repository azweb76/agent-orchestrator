import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeBranchName } from './anthropic.js';

test('sanitizeBranchName converts a normal idea into a hyphenated slug', () => {
  assert.equal(sanitizeBranchName('Add dark mode toggle'), 'add-dark-mode-toggle');
});

test('sanitizeBranchName lowercases and collapses punctuation and whitespace', () => {
  assert.equal(
    sanitizeBranchName('  Fix!!  the   Login Bug???  '),
    'fix-the-login-bug',
  );
});

test('sanitizeBranchName preserves a conventional prefix separator', () => {
  assert.equal(sanitizeBranchName('feature/Add Dark Mode'), 'feature/add-dark-mode');
});

test('sanitizeBranchName falls back to a non-empty slug for empty input', () => {
  const result = sanitizeBranchName('');
  assert.ok(result.length > 0);
});

test('sanitizeBranchName falls back to a non-empty slug for garbage-only input', () => {
  const result = sanitizeBranchName('!!!@@@###???');
  assert.ok(result.length > 0);
  assert.doesNotThrow(() => sanitizeBranchName('!!!@@@###???'));
});

test('sanitizeBranchName truncates overly long input to ~50 chars', () => {
  const longIdea = 'add support for '.repeat(20);
  const result = sanitizeBranchName(longIdea);
  assert.ok(result.length <= 50);
  assert.ok(result.length > 0);
});

test('sanitizeBranchName passes through an already-valid slug', () => {
  assert.equal(sanitizeBranchName('feature/my-change'), 'feature/my-change');
});

test('sanitizeBranchName strips leading/trailing separators', () => {
  assert.equal(sanitizeBranchName('/-add-thing-/-'), 'add-thing');
});
