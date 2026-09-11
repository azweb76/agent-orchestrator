export function composerInputPlaceholder(args: {
  archived: boolean;
  goalLocked?: boolean;
}): string {
  if (args.goalLocked) return 'Save a goal on the Goal tab before chatting.';
  if (args.archived) return 'This agent is archived';
  return 'Message Claude…';
}
