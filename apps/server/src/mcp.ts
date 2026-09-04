import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ASSISTANT_TOOLS } from '@agent-orchestrator/shared';
import { initDatabase, createRepositories } from './db/index.js';
import { ClaudeService, GitService } from './services/git.js';
import { GitHubService } from './services/github.js';
import { JiraService } from './services/jira.js';
import { AnthropicService } from './services/anthropic.js';
import type { AppContext } from './services/app-context.js';
import { executeAssistantTool } from './services/assistant-tools.js';
import { applyPersistedSecrets } from './services/setup.js';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(rootDir, 'data'));
applyPersistedSecrets(dataDir);

function createMcpContext(): AppContext {
  const db = initDatabase(dataDir);
  const repos = createRepositories(db);
  const claudeBin = process.env.CLAUDE_BIN ?? 'claude';
  return {
    repos,
    git: new GitService(),
    github: new GitHubService({ token: process.env.GITHUB_TOKEN }),
    jira: new JiraService({
      baseUrl: process.env.JIRA_BASE_URL,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
    }),
    claude: new ClaudeService(claudeBin, path.join(dataDir, 'runs')),
    anthropic: new AnthropicService(),
    dataDir,
  };
}

function assertMcpAuth(): void {
  const authToken = process.env.AUTH_TOKEN?.trim();
  if (!authToken) return;
  const presented = process.env.ASSISTANT_MCP_TOKEN?.trim();
  if (!presented || presented !== authToken) {
    console.error(
      'ASSISTANT_MCP_TOKEN must match AUTH_TOKEN when AUTH_TOKEN is set (stdio MCP gate).',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertMcpAuth();
  const ctx = createMcpContext();

  const server = new Server(
    { name: 'agent-orchestrator-assistant', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Agent Orchestrator Assistant tools for managing workspaces, agents, tasks, and the work queue. Mutating tools require confirm=true.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ASSISTANT_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const result = await executeAssistantTool(ctx, request.params.name, args);
    return {
      content: [{ type: 'text' as const, text: result.content }],
      isError: result.isError,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
