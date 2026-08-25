import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { initDatabase, createRepositories } from './db/index.js';
import { ClaudeService, GitService } from './services/git.js';
import { GitHubService } from './services/github.js';
import { AnthropicService } from './services/anthropic.js';
import { createRouter, errorHandler } from './routes/index.js';
import { recoverRunningAgents, type AppContext } from './services/app.js';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(rootDir, 'data'));
const port = Number(process.env.PORT ?? 3001);
const claudeBin = process.env.CLAUDE_BIN ?? 'claude';

const db = initDatabase(dataDir);
const repos = createRepositories(db);

const ctx: AppContext = {
  repos,
  git: new GitService(),
  github: new GitHubService({ token: process.env.GITHUB_TOKEN }),
  claude: new ClaudeService(claudeBin, path.join(dataDir, 'runs')),
  anthropic: new AnthropicService(),
  dataDir,
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', createRouter(ctx));
app.use(errorHandler);

const webDist = path.resolve(rootDir, 'apps/web/dist');
app.use(express.static(webDist));
app.get('{*splat}', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Agent Orchestrator running at http://localhost:${port}`);
  console.log(`Data directory: ${dataDir}`);
  recoverRunningAgents(ctx);
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down without stopping agent processes`);

  // Detached Claude runs keep going; drop local handles so we do not signal them.
  ctx.claude.releaseAll();

  server.close((err) => {
    if (err) {
      console.error('Error while closing HTTP server:', err);
    }
    try {
      db.close();
    } catch {
      // already closed
    }
    process.exit(err ? 1 : 0);
  });

  // Do not wait forever on open SSE connections — agents are independent of the HTTP server.
  setTimeout(() => {
    try {
      db.close();
    } catch {
      // already closed
    }
    process.exit(0);
  }, 2_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
