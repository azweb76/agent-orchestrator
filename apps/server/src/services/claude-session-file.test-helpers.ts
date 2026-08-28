import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';

const tmpDirs: string[] = [];

export function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-session-file-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
