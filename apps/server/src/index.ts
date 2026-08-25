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
import type { AppContext } from './services/app.js';

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
  claude: new ClaudeService(claudeBin),
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

app.listen(port, () => {
  console.log(`Agent Orchestrator running at http://localhost:${port}`);
  console.log(`Data directory: ${dataDir}`);
});
