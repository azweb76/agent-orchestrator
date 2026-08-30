import { apiAgentTasks } from './apiAgentTasks';
import { apiAgents } from './apiAgents';
import { apiGitHub } from './apiGitHub';
import { apiSetup } from './apiSetup';
import { apiWorkspaces } from './apiWorkspaces';
import {
  getAutomationSettings,
  triggerAutomationPollNow,
  updateAutomationSettings,
} from '../automation/settings';
import { getSettings, updateSettings } from '../settings/api';

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
  ...apiAgentTasks,
  getAutomationSettings,
  triggerAutomationPollNow,
  updateAutomationSettings,
  getSettings,
  updateSettings,
};
