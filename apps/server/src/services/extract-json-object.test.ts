import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractJsonObject, repairLooseJson } from './extract-json-object.js';

describe('extractJsonObject', () => {
  it('parses a plain JSON object', () => {
    assert.deepEqual(extractJsonObject('{"score":2,"summary":"ok"}'), {
      score: 2,
      summary: 'ok',
    });
  });

  it('returns an already-parsed object', () => {
    const input = { score: 4, summary: 'good' };
    assert.equal(extractJsonObject(input), input);
  });

  it('parses compact unquoted keys (the Grade this session SyntaxError)', () => {
    const parsed = extractJsonObject(
      '{score: 2, summary: "Too many turns.", findings: [{category: "skills", severity: "issue", title: "None", detail: "Add a skill."}]}',
    );
    assert.equal(parsed.score, 2);
    assert.equal(parsed.summary, 'Too many turns.');
    assert.equal((parsed.findings as unknown[])?.length, 1);
  });

  it('skips prose braces and uses the real grade object', () => {
    const raw = `I'll look at wasted tokens {especially rereads} then grade.

{
  "score": 3,
  "summary": "Mixed efficiency.",
  "findings": []
}`;
    const parsed = extractJsonObject(raw, 'Session grade response');
    assert.equal(parsed.score, 3);
    assert.equal(parsed.summary, 'Mixed efficiency.');
  });

  it('parses fenced JSON with a language tag', () => {
    const parsed = extractJsonObject('```json\n{"score":5,"summary":"Efficient."}\n```');
    assert.equal(parsed.score, 5);
  });

  it('parses single-quoted keys and trailing commas', () => {
    const parsed = extractJsonObject(`{
      'score': 4,
      'summary': "Looks good",
    }`);
    assert.equal(parsed.score, 4);
    assert.equal(parsed.summary, 'Looks good');
  });

  it('throws a friendly error instead of a SyntaxError', () => {
    assert.throws(() => extractJsonObject('{not json at all', 'Session grade response'), {
      message: 'Session grade response was not valid JSON',
    });
    assert.throws(() => extractJsonObject('{', 'Session grade response'), {
      message: 'Session grade response was not valid JSON',
    });
  });
});

describe('repairLooseJson', () => {
  it('quotes identifiers used as keys', () => {
    assert.equal(repairLooseJson('{score: 1}'), '{"score": 1}');
  });
});
