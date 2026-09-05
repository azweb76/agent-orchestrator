import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { initDatabase, createRepositories } from './db/index.js';
import { ClaudeService, GitService } from './services/git.js';
import { GitHubService } from './services/github.js';
import { JiraService } from './services/jira.js';
import { AnthropicService } from './services/anthropic.js';
import { Notifier } from './services/notifier.js';
import { createRouter, errorHandler } from './routes/index.js';
import { recoverRunningAgents, type AppContext } from './services/app.js';
import { ensureBuiltInTaskFollowUps } from './services/task-followups.js';
import { startGithubPollBus } from './services/github-poll-bus.js';
import { startWatchdog } from './services/watchdog.js';
import { optionalBearerAuth } from './auth.js';
import { applyPersistedSecrets } from './services/setup.js';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(rootDir, 'data'));
applyPersistedSecrets(dataDir);
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST?.trim() || '127.0.0.1';
const authToken = process.env.AUTH_TOKEN?.trim() || undefined;
const claudeBin = process.env.CLAUDE_BIN ?? 'claude';

const db = initDatabase(dataDir);
const repos = createRepositories(db);

const ctx: AppContext = {
  repos,
  git: new GitService(),
  github: new GitHubService({ token: process.env.GITHUB_TOKEN, cacheDir: path.join(dataDir, 'cache') }),
  jira: new JiraService({
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  }),
  claude: new ClaudeService(claudeBin, path.join(dataDir, 'runs')),
  anthropic: new AnthropicService(),
  dataDir,
  notifier: new Notifier(),
};
ensureBuiltInTaskFollowUps(ctx);

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/auth') {
    next();
    return;
  }
  optionalBearerAuth(authToken)(req, res, next);
});
app.use('/api', createRouter(ctx));
app.use(errorHandler);

const webDist = path.resolve(rootDir, 'apps/web/dist');
app.use(express.static(webDist));
app.get('{*splat}', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

const server = app.listen(port, host, () => {
  console.log(`Agent Orchestrator running at http://${host}:${port}`);
  console.log(`Data directory: ${dataDir}`);
  recoverRunningAgents(ctx);
  startGithubPollBus(ctx);
  startWatchdog(ctx);
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
