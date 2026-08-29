import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  createWorktreeFromBranch,
  createWorktreeFromGoal,
  createWorktreeFromIdea,
  createWorktreeFromIssue,
  createWorktreeFromPr,
  createWorkspace,
  deleteWorktree,
  deleteWorkspace,
  getWorkspace,
  listGitHubBranches,
  listGitHubPullRequests,
  listSidebarTree,
  listWorkspaces,
  listWorktrees,
} from '../services/app.js';
import { asyncHandler, param } from './helpers.js';

export function registerWorkspaceRoutes(router: express.Router, ctx: AppContext): void {
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
    '/workspaces/:workspaceId/worktrees/from-goal',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          goal: z.string().min(1),
          name: z.string().optional(),
          baseBranch: z.string().optional(),
        })
        .parse(req.body);
      res.status(201).json(await createWorktreeFromGoal(ctx, param(req.params.workspaceId), body));
    }),
  );

  router.post(
    '/workspaces/:workspaceId/worktrees/from-idea',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          idea: z.string().min(1),
          name: z.string().optional(),
          baseBranch: z.string().optional(),
          model: z.string().optional(),
          effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
          permissionMode: z
            .enum(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'])
            .optional(),
        })
        .parse(req.body);
      res.status(201).json(await createWorktreeFromIdea(ctx, param(req.params.workspaceId), body));
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

  router.post(
    '/workspaces/:workspaceId/worktrees/from-issue',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          issueNumber: z.number().int().positive().optional(),
          reference: z.string().optional(),
          name: z.string().optional(),
          baseBranch: z.string().optional(),
          model: z.string().optional(),
          effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
          permissionMode: z
            .enum(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'])
            .optional(),
        })
        .refine((value) => Boolean(value.issueNumber) || Boolean(value.reference?.trim()), {
          message: 'issueNumber or reference is required',
        })
        .parse(req.body);
      res.status(201).json(await createWorktreeFromIssue(ctx, param(req.params.workspaceId), body));
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
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      res.json(await listGitHubPullRequests(ctx, param(req.params.workspaceId), query));
    }),
  );
}
