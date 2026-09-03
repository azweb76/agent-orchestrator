import express from 'express';
import { z } from 'zod';
import type { AppContext } from '../services/app.js';
import {
  createAgentFromJiraIssue,
  getJiraIssueInbox,
} from '../services/app.js';
import { asyncHandler } from './helpers.js';

export function registerJiraRoutes(router: express.Router, ctx: AppContext): void {
  router.get(
    '/jira/issues/inbox',
    asyncHandler(async (_req, res) => {
      res.json(await getJiraIssueInbox(ctx));
    }),
  );

  router.post(
    '/jira/issues/create-agent',
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          workspaceId: z.string().min(1),
          issueKey: z.string().min(1),
          name: z.string().optional(),
        })
        .parse(req.body);
      const result = await createAgentFromJiraIssue(ctx, body);
      res.status(201).json(result);
    }),
  );
}
