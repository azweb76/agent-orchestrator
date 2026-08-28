import { apiAgents } from './apiAgents';
import { apiGitHub } from './apiGitHub';
import { apiSetup } from './apiSetup';
import { apiWorkspaces } from './apiWorkspaces';
import {
  getAutomationSettings,
  updateAutomationSettings,
} from '../automation/settings';

export { setAuthToken } from './request';
export type { ChatStreamHandlers, SetupInfo, SystemStatus } from './types';
export {
  streamBuildPlan,
  streamChat,
  streamCompactSession,
  streamSessionFollow,
} from './chatStream';

export const api = {
  ...apiSetup,
  ...apiWorkspaces,
  ...apiGitHub,
  ...apiAgents,
  getAutomationSettings,
  updateAutomationSettings,
};
