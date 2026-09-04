import { apiAgentTasks } from './apiAgentTasks';
import { apiAgents } from './apiAgents';
import { apiAssistant } from './apiAssistant';
import { apiGitHub } from './apiGitHub';
import { apiJira } from './apiJira';
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
  ...apiJira,
  ...apiAgents,
  ...apiAgentTasks,
  ...apiAssistant,
  getAutomationSettings,
  triggerAutomationPollNow,
  updateAutomationSettings,
  getSettings,
  updateSettings,
};
