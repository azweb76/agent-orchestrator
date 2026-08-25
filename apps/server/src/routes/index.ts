import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  archiveAgent,
  createAgentFromPullRequest,
  createAgentPullRequest,
  createWorktreeFromBranch,
  createWorktreeFromPr,
  createWorkspace,
  deleteWorktree,
  deleteWorkspace,
  getAgentDetail,
  getAgentDiff,
  getAgentEvents,
  getAgentMessages,
  getPullRequestInbox,
  getSystemStatus,
  getWorkspace,
  listGitHubBranches,
  listGitHubPullRequests,
  listSidebarTree,
  listWorkspaces,
  listWorktrees,
  searchGitHubRepositories,
  startAgent,
  stopAgent,
  streamAgentChat,
  suggestBranchNameForWorkspace,
  updateAgent,
} from '../services/app.js';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function asyncHandler(
  fn: (req: express.Request, res: express.Response) => Promise<void>,
): express.RequestHandler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

export function createRouter(ctx: AppContext): express.Router {
  const router = express.Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      res.json(await getSystemStatus(ctx));
    }),
  );

  router.get(
    '/workspaces',
    asyncHandler(async (_req, res) => {
      res.json(await listWorkspaces(ctx));
    }),
  );

  router.get(
    '/sidebar',
    asyncHandler(async (_req, res) => {
      res.json(await listSidebarTree(ctx));
    }),
  );

  router.post(
    '/workspaces',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          repoUrl: z.string().url(),
          name: z.string().optional(),
        })
        .parse(req.body);
      res.status(201).json(await createWorkspace(ctx, body));
    }),
  );

  router.get(
    '/workspaces/:workspaceId',
    asyncHandler(async (req, res) => {
      res.json(await getWorkspace(ctx, param(req.params.workspaceId)));
    }),
  );

  router.delete(
    '/workspaces/:workspaceId',
    asyncHandler(async (req, res) => {
      await deleteWorkspace(ctx, param(req.params.workspaceId));
      res.status(204).end();
    }),
  );

  router.get(
    '/workspaces/:workspaceId/worktrees',
    asyncHandler(async (req, res) => {
      res.json(await listWorktrees(ctx, param(req.params.workspaceId)));
    }),
  );

  router.post(
    '/workspaces/:workspaceId/worktrees/from-branch',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          branch: z.string().min(1),
          name: z.string().optional(),
          createNew: z.boolean().optional(),
          baseBranch: z.string().optional(),
        })
        .parse(req.body);
      res.status(201).json(await createWorktreeFromBranch(ctx, param(req.params.workspaceId), body));
    }),
  );

  router.post(
    '/workspaces/:workspaceId/worktrees/suggest-branch-name',
    asyncHandler(async (req, res) => {
      const body = z.object({ idea: z.string().min(1) }).parse(req.body);
      const branchName = await suggestBranchNameForWorkspace(
        ctx,
        param(req.params.workspaceId),
        body.idea,
      );
      res.json({ branchName });
    }),
  );

  router.post(
    '/workspaces/:workspaceId/worktrees/from-pr',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          prNumber: z.number().int().positive(),
          name: z.string().optional(),
        })
        .parse(req.body);
      res.status(201).json(await createWorktreeFromPr(ctx, param(req.params.workspaceId), body));
    }),
  );

  router.delete(
    '/worktrees/:worktreeId',
    asyncHandler(async (req, res) => {
      await deleteWorktree(ctx, param(req.params.worktreeId));
      res.status(204).end();
    }),
  );

  router.get(
    '/workspaces/:workspaceId/github/branches',
    asyncHandler(async (req, res) => {
      res.json(await listGitHubBranches(ctx, param(req.params.workspaceId)));
    }),
  );

  router.get(
    '/workspaces/:workspaceId/github/pulls',
    asyncHandler(async (req, res) => {
      res.json(await listGitHubPullRequests(ctx, param(req.params.workspaceId)));
    }),
  );

  router.get(
    '/github/repos/search',
    asyncHandler(async (req, res) => {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      res.json(await searchGitHubRepositories(ctx, query));
    }),
  );

  router.get(
    '/github/pulls/inbox',
    asyncHandler(async (_req, res) => {
      res.json(await getPullRequestInbox(ctx));
    }),
  );

  router.post(
    '/github/pulls/create-agent',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          owner: z.string().min(1),
          repo: z.string().min(1),
          prNumber: z.number().int().positive(),
          name: z.string().optional(),
        })
        .parse(req.body);
      const result = await createAgentFromPullRequest(ctx, body);
      res.status(result.created ? 201 : 200).json(result);
    }),
  );

  router.get(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      res.json(await getAgentDetail(ctx, param(req.params.agentId)));
    }),
  );

  router.patch(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().optional(),
          model: z.string().optional(),
          environment: z.string().nullable().optional(),
        })
        .parse(req.body);
      res.json(await updateAgent(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/start',
    asyncHandler(async (req, res) => {
      res.json(await startAgent(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/stop',
    asyncHandler(async (req, res) => {
      res.json(await stopAgent(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/archive',
    asyncHandler(async (req, res) => {
      res.json(await archiveAgent(ctx, param(req.params.agentId)));
    }),
  );

  router.get(
    '/agents/:agentId/messages',
    asyncHandler(async (req, res) => {
      res.json(getAgentMessages(ctx, param(req.params.agentId)));
    }),
  );

  router.get(
    '/agents/:agentId/events',
    asyncHandler(async (req, res) => {
      res.json(getAgentEvents(ctx, param(req.params.agentId)));
    }),
  );

  router.get(
    '/agents/:agentId/diff',
    asyncHandler(async (req, res) => {
      res.json(await getAgentDiff(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/create-pr',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().min(1),
          body: z.string().optional(),
          base: z.string().optional(),
        })
        .parse(req.body);
      res.status(201).json(await createAgentPullRequest(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/chat',
    asyncHandler(async (req, res) => {
      const body = z.object({ message: z.string().min(1) }).parse(req.body);
      await streamAgentChat(ctx, param(req.params.agentId), body.message, res);
    }),
  );

  return router;
}

export function errorHandler(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.issues });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = message.includes('not found') ? 404 : 500;
  res.status(status).json({ error: message });
}
