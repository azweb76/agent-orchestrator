import { apiAgentTasks } from './apiAgentTasks';
import { apiTaskFollowUps } from './apiTaskFollowUps';
import { apiPersonalSkills } from './apiPersonalSkills';
import { apiBrain } from './apiBrain';
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
export { streamAssistantChat } from './apiAssistant';

export const api = {
  ...apiSetup,
  ...apiWorkspaces,
  ...apiGitHub,
  ...apiJira,
  ...apiAgents,
  ...apiAgentTasks,
  ...apiTaskFollowUps,
  ...apiPersonalSkills,
  ...apiBrain,
  ...apiAssistant,
  getAutomationSettings,
  triggerAutomationPollNow,
  updateAutomationSettings,
  getSettings,
  updateSettings,
};
