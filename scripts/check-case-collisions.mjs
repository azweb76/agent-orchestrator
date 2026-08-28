#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

/** @type {Map<string, Map<string, string>>} */
const byDir = new Map();

for (const filePath of tracked) {
  const dir = path.posix.dirname(filePath);
  const base = path.posix.basename(filePath, path.posix.extname(filePath)).toLowerCase();
  if (!byDir.has(dir)) byDir.set(dir, new Map());
  const seen = byDir.get(dir);
  const existing = seen.get(base);
  if (existing && existing !== filePath) {
    console.error(`Case collision in ${dir}: ${existing} vs ${filePath}`);
    process.exit(1);
  }
  seen.set(base, filePath);
}
