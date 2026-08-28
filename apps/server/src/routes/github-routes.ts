import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  createAgentFromIssue,
  createAgentFromPullRequest,
  createPullRequestComment,
  getIssueInbox,
  getPullRequestChecks,
  getPullRequestComments,
  getPullRequestCommits,
  getPullRequestDetail,
  getPullRequestFiles,
  getPullRequestInbox,
  getPullRequestReviews,
  markPullRequestReady,
  mergePullRequest,
  searchGitHubRepositories,
  setPullRequestState,
  submitPullRequestReview,
  updatePullRequestBranch,
} from '../services/app.js';
import { asyncHandler } from './helpers.js';
import { prRef } from './schemas.js';

export function registerGitHubRoutes(router: express.Router, ctx: AppContext): void {
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

  router.get(
    '/github/issues/inbox',
    asyncHandler(async (_req, res) => {
      res.json(await getIssueInbox(ctx));
    }),
  );

  router.post(
    '/github/issues/create-agent',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          owner: z.string().min(1),
          repo: z.string().min(1),
          issueNumber: z.number().int().positive(),
          name: z.string().optional(),
        })
        .parse(req.body);
      const result = await createAgentFromIssue(ctx, body);
      res.status(201).json(result);
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
          template: z.enum(['fix-ci', 'address-review']).optional(),
        })
        .parse(req.body);
      const result = await createAgentFromPullRequest(ctx, body);
      res.status(result.created ? 201 : 200).json(result);
    }),
  );

  // Repo-scoped PR routes. The `/github/pulls/*` routes above are user-scoped
  // (no repo in the path), so these live under the `/github/repos` namespace.
  const prPath = '/github/repos/:owner/:repo/pulls/:number';

  router.get(
    prPath,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await getPullRequestDetail(ctx, owner, repo, prNumber));
    }),
  );

  router.get(
    `${prPath}/checks`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await getPullRequestChecks(ctx, owner, repo, prNumber));
    }),
  );

  router.get(
    `${prPath}/reviews`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await getPullRequestReviews(ctx, owner, repo, prNumber));
    }),
  );

  router.get(
    `${prPath}/files`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await getPullRequestFiles(ctx, owner, repo, prNumber));
    }),
  );

  router.get(
    `${prPath}/commits`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await getPullRequestCommits(ctx, owner, repo, prNumber));
    }),
  );

  router.get(
    `${prPath}/comments`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await getPullRequestComments(ctx, owner, repo, prNumber));
    }),
  );

  router.post(
    `${prPath}/reviews`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      const body = z
        .object({
          event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
          body: z.string().max(65_536).optional(),
        })
        .refine((value) => value.event === 'APPROVE' || Boolean(value.body?.trim()), {
          message: 'A review body is required when requesting changes or commenting',
        })
        .parse(req.body ?? {});
      res.status(201).json(await submitPullRequestReview(ctx, owner, repo, prNumber, body));
    }),
  );

  router.post(
    `${prPath}/comments`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      const body = z.object({ body: z.string().min(1).max(65_536) }).parse(req.body ?? {});
      res.status(201).json(await createPullRequestComment(ctx, owner, repo, prNumber, body));
    }),
  );

  router.post(
    `${prPath}/merge`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      const body = z
        .object({
          method: z.enum(['merge', 'squash', 'rebase']),
          commitTitle: z.string().max(300).optional(),
          commitMessage: z.string().max(20000).optional(),
          expectedHeadSha: z.string().regex(/^[0-9a-f]{7,40}$/).optional(),
        })
        .parse(req.body);
      res.json(await mergePullRequest(ctx, owner, repo, prNumber, body));
    }),
  );

  router.post(
    `${prPath}/update-branch`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      const body = z
        .object({ expectedHeadSha: z.string().regex(/^[0-9a-f]{7,40}$/).optional() })
        .parse(req.body ?? {});
      res.json(await updatePullRequestBranch(ctx, owner, repo, prNumber, body));
    }),
  );

  router.patch(
    `${prPath}/state`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      const body = z.object({ state: z.enum(['open', 'closed']) }).parse(req.body);
      res.json(await setPullRequestState(ctx, owner, repo, prNumber, body));
    }),
  );

  router.post(
    `${prPath}/ready`,
    asyncHandler(async (req, res) => {
      const { owner, repo, prNumber } = prRef(req);
      res.json(await markPullRequestReady(ctx, owner, repo, prNumber));
    }),
  );
}
