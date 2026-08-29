import express from 'express';
import type { AppContext } from '../services/app.js';
import { registerAgentRoutes } from './agent-routes.js';
import { registerAgentToolRoutes } from './agent-tool-routes.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerChatRoutes } from './chat-routes.js';
import { registerEventsRoutes } from './events-routes.js';
import { registerGitHubRoutes } from './github-routes.js';
import { registerSessionRoutes } from './session-routes.js';
import { registerWorkspaceRoutes } from './workspace-routes.js';
import { registerSettingsRoutes } from './settings-routes.js';
import { registerSessionProfileRoutes } from './session-profile-routes.js';

export { errorHandler } from './error-handler.js';

export function createRouter(ctx: AppContext): express.Router {
  const router = express.Router();

  registerAuthRoutes(router, ctx);
  registerEventsRoutes(router, ctx);
  registerSettingsRoutes(router, ctx);
  registerSessionProfileRoutes(router, ctx);
  registerWorkspaceRoutes(router, ctx);
  registerGitHubRoutes(router, ctx);
  registerAgentRoutes(router, ctx);
  registerSessionRoutes(router, ctx);
  registerChatRoutes(router, ctx);
  registerAgentToolRoutes(router, ctx);

  return router;
}
