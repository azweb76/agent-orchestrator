import express from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import { GitHubApiError } from '../services/github.js';
import {
  archiveAgent,
  allowPermissionRequest,
  answerAskUserQuestion,
  activateAgentSession,
  buildApprovedPlan,
  clearAgentChat,
  createAgentFromPullRequest,
  createAgentPullRequest,
  createAgentSession,
  createWorktreeFromBranch,
  createWorktreeFromIdea,
  createWorktreeFromPr,
  createWorkspace,
  denyPermissionRequest,
  deleteAgentSession,
  deleteWorktree,
  deleteWorkspace,
  getAgentAttachment,
  getAgentDetail,
  getAgentDiff,
  getAgentEvents,
  getAgentMessages,
  getAgentSessionContext,
  getPullRequestChecks,
  getPullRequestComments,
  getPullRequestCommits,
  getPullRequestDetail,
  getPullRequestFiles,
  getPullRequestInbox,
  getPullRequestReviews,
  getSystemStatus,
  getWorkspace,
  gradeAgentSession,
  generateAgentInstructionDraft,
  applyAgentInstructionFile,
  listAgentInstructionFiles,
  listAgentSessions,
  listAgentSlashCommands,
  listGitHubBranches,
  listGitHubPullRequests,
  listPendingPermissions,
  listSidebarTree,
  listWorkspaces,
  listWorktrees,
  mergePullRequest,
  pruneArchivedAgents,
  rewindAgentChat,
  searchGitHubRepositories,
  setPullRequestState,
  stopAgent,
  stopAgentSession,
  streamAgentChat,
  suggestBranchNameForWorkspace,
  updateAgent,
  updateAgentSession,
  updatePullRequestBranch,
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

  // Repo-scoped PR routes. The `/github/pulls/*` routes above are user-scoped
  // (no repo in the path), so these live under the `/github/repos` namespace.
  const prPath = '/github/repos/:owner/:repo/pulls/:number';

  function prRef(req: express.Request): { owner: string; repo: string; prNumber: number } {
    const segment = z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
    const parsed = z
      .object({
        owner: segment,
        repo: segment,
        number: z.coerce.number().int().positive(),
      })
      .parse({
        owner: param(req.params.owner),
        repo: param(req.params.repo),
        number: param(req.params.number),
      });
    return { owner: parsed.owner, repo: parsed.repo, prNumber: parsed.number };
  }

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

  router.get(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      res.json(await getAgentDetail(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/prune-archived',
    asyncHandler(async (_req, res) => {
      res.json(await pruneArchivedAgents(ctx));
    }),
  );

  router.patch(
    '/agents/:agentId',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().optional(),
          model: z.string().optional(),
          effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
          permissionMode: z
            .enum(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'])
            .optional(),
        })
        .parse(req.body);
      res.json(await updateAgent(ctx, param(req.params.agentId), body));
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
      const body = z.object({ deleteWorktree: z.boolean().optional() }).parse(req.body ?? {});
      res.json(await archiveAgent(ctx, param(req.params.agentId), body));
    }),
  );

  const sessionTemplate = z.enum(['chat', 'build', 'create-draft-pr', 'review']);

  router.get(
    '/agents/:agentId/sessions',
    asyncHandler(async (req, res) => {
      res.json(listAgentSessions(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/sessions',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          template: sessionTemplate.optional(),
          title: z.string().trim().min(1).max(80).optional(),
        })
        .parse(req.body ?? {});
      res.status(201).json(await createAgentSession(ctx, param(req.params.agentId), body));
    }),
  );

  router.patch(
    '/agents/:agentId/sessions/:sessionId',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().trim().min(1).max(80).optional(),
          model: z.string().optional(),
          effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
          permissionMode: z
            .enum(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'])
            .optional(),
        })
        .parse(req.body);
      res.json(
        await updateAgentSession(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          body,
        ),
      );
    }),
  );

  router.delete(
    '/agents/:agentId/sessions/:sessionId',
    asyncHandler(async (req, res) => {
      res.json(
        await deleteAgentSession(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.put(
    '/agents/:agentId/sessions/:sessionId/grade',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          notes: z.string().max(4000).optional(),
        })
        .parse(req.body ?? {});
      res.json(
        await gradeAgentSession(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          body,
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/instruction-drafts',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          kind: z.enum(['skill', 'claude_md', 'agents_md']),
          scope: z.enum(['project', 'personal']).optional(),
          relativePath: z.string().min(1).max(240).optional(),
          name: z.string().max(80).optional(),
          extraNotes: z.string().max(4000).optional(),
        })
        .parse(req.body);
      res.json(
        await generateAgentInstructionDraft(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
          body,
        ),
      );
    }),
  );

  router.get(
    '/agents/:agentId/instruction-files',
    asyncHandler(async (req, res) => {
      res.json(await listAgentInstructionFiles(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/instruction-files',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          kind: z.enum(['skill', 'claude_md', 'agents_md']),
          scope: z.enum(['project', 'personal']),
          content: z.string().min(1).max(200_000),
          name: z.string().max(80).optional(),
          relativePath: z.string().min(1).max(240).optional(),
        })
        .parse(req.body);
      res.json(await applyAgentInstructionFile(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/activate',
    asyncHandler(async (req, res) => {
      res.json(
        await activateAgentSession(ctx, param(req.params.agentId), param(req.params.sessionId)),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/stop',
    asyncHandler(async (req, res) => {
      res.json(await stopAgentSession(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/messages',
    asyncHandler(async (req, res) => {
      res.json(getAgentMessages(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/context',
    asyncHandler(async (req, res) => {
      res.json(
        await getAgentSessionContext(
          ctx,
          param(req.params.agentId),
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.delete(
    '/agents/:agentId/sessions/:sessionId/messages',
    asyncHandler(async (req, res) => {
      res.json(await clearAgentChat(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/messages/rewind',
    asyncHandler(async (req, res) => {
      const body = z.object({ messageId: z.string().min(1) }).parse(req.body);
      res.json(
        await rewindAgentChat(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.get(
    '/agents/:agentId/sessions/:sessionId/permissions',
    asyncHandler(async (req, res) => {
      res.json(listPendingPermissions(ctx, param(req.params.agentId), param(req.params.sessionId)));
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/answer',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          answers: z.record(z.string(), z.string()),
          response: z.string().optional(),
        })
        .parse(req.body);
      res.json(
        await answerAskUserQuestion(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/allow',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          updatedInput: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(req.body);
      res.json(
        await allowPermissionRequest(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/deny',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          message: z.string().optional(),
        })
        .parse(req.body);
      res.json(
        await denyPermissionRequest(
          ctx,
          param(req.params.agentId),
          body,
          param(req.params.sessionId),
        ),
      );
    }),
  );

  router.post(
    '/agents/:agentId/sessions/:sessionId/permissions/build',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().optional(),
          plan: z.string().optional(),
        })
        .parse(req.body);
      await buildApprovedPlan(
        ctx,
        param(req.params.agentId),
        body,
        res,
        param(req.params.sessionId),
      );
    }),
  );

  const chatBody = z
    .object({
      message: z.string(),
      force: z.boolean().optional(),
      images: z
        .array(
          z.object({
            name: z.string().min(1),
            mimeType: z.string().min(1),
            dataBase64: z.string().min(1),
          }),
        )
        .optional(),
    })
    .refine((value) => value.message.trim().length > 0 || (value.images?.length ?? 0) > 0, {
      message: 'Message or image required',
    });

  router.post(
    '/agents/:agentId/sessions/:sessionId/chat',
    asyncHandler(async (req, res) => {
      const body = chatBody.parse(req.body);
      await streamAgentChat(
        ctx,
        param(req.params.agentId),
        body,
        res,
        param(req.params.sessionId),
      );
    }),
  );

  router.get(
    '/agents/:agentId/messages',
    asyncHandler(async (req, res) => {
      res.json(getAgentMessages(ctx, param(req.params.agentId)));
    }),
  );

  router.delete(
    '/agents/:agentId/messages',
    asyncHandler(async (req, res) => {
      res.json(await clearAgentChat(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/messages/rewind',
    asyncHandler(async (req, res) => {
      const body = z.object({ messageId: z.string().min(1) }).parse(req.body);
      res.json(await rewindAgentChat(ctx, param(req.params.agentId), body));
    }),
  );

  router.get(
    '/agents/:agentId/permissions',
    asyncHandler(async (req, res) => {
      res.json(listPendingPermissions(ctx, param(req.params.agentId)));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/answer',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          answers: z.record(z.string(), z.string()),
          response: z.string().optional(),
        })
        .parse(req.body);
      res.json(await answerAskUserQuestion(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/allow',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          updatedInput: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(req.body);
      res.json(await allowPermissionRequest(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/deny',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().min(1),
          message: z.string().optional(),
        })
        .parse(req.body);
      res.json(await denyPermissionRequest(ctx, param(req.params.agentId), body));
    }),
  );

  router.post(
    '/agents/:agentId/permissions/build',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          requestId: z.string().optional(),
          plan: z.string().optional(),
        })
        .parse(req.body);
      await buildApprovedPlan(ctx, param(req.params.agentId), body, res);
    }),
  );

  router.get(
    '/agents/:agentId/attachments/:attachmentId',
    asyncHandler(async (req, res) => {
      const attachment = getAgentAttachment(
        ctx,
        param(req.params.agentId),
        param(req.params.attachmentId),
      );
      if (!fs.existsSync(attachment.path)) {
        res.status(404).json({ error: 'Attachment file missing' });
        return;
      }
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${attachment.name}"`);
      fs.createReadStream(attachment.path).pipe(res);
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
      const scopeParse = z.enum(['pending', 'pr']).safeParse(req.query.scope ?? 'pending');
      if (!scopeParse.success) {
        res.status(400).json({ error: 'Invalid scope; use pending or pr' });
        return;
      }
      res.json(await getAgentDiff(ctx, param(req.params.agentId), scopeParse.data));
    }),
  );

  router.get(
    '/agents/:agentId/slash-commands',
    asyncHandler(async (req, res) => {
      res.json(await listAgentSlashCommands(ctx, param(req.params.agentId)));
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
      const body = chatBody.parse(req.body);
      await streamAgentChat(ctx, param(req.params.agentId), body, res);
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

  // Must precede the message sniff below so GitHub's 405/409/422 merge errors
  // arrive as readable client errors instead of a generic 500.
  if (err instanceof GitHubApiError) {
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    res.status(status).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = message.includes('not found') ? 404 : 500;
  res.status(status).json({ error: message });
}
