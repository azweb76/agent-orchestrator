import type { AssistantMessage } from './assistant.js';
import type { ChatSession, ChatSessionTemplateId, SessionGradeScore } from './chat-session.js';
import {
  isBrainDraftKind,
  mergeBrainDraft,
  parseBrainDraft,
  type BrainDraft,
  type BrainDraftKind,
} from './brain.js';

export type BrainLibraryKind = BrainDraftKind;

export interface BrainChangeFile {
  id: string;
  kind: BrainDraftKind;
  action: 'create' | 'update';
  draft: BrainDraft;
  baseline: BrainDraft;
  dirtyKeys: string[];
}

export interface BrainChangeSet {
  files: BrainChangeFile[];
  selectedId: string | null;
}

/** Compact graded-session row for Brain copilot chips and GET /sessions/grades. */
export interface SessionGradeListItem {
  id: string;
  agentId: string;
  title: string;
  template: ChatSessionTemplateId;
  score: SessionGradeScore | null;
  comment: string;
  findingTitles: string[];
  gradedAt: string | null;
}

export function emptyBrainChangeSet(): BrainChangeSet {
  return { files: [], selectedId: null };
}

export function toSessionGradeListItem(session: ChatSession): SessionGradeListItem {
  return {
    id: session.id,
    agentId: session.agentId,
    title: session.title,
    template: session.template,
    score: session.grade?.score ?? null,
    comment: session.grade?.comment ?? '',
    findingTitles: (session.grade?.analysis?.findings ?? []).map((finding) => finding.title),
    gradedAt: session.grade?.gradedAt ?? null,
  };
}

export function brainDraftIdentity(draft: BrainDraft): string | undefined {
  if (draft.kind === 'skill' || draft.kind === 'agent') return draft.slug;
  if (draft.kind === 'task' || draft.kind === 'follow-up') return draft.id;
  return undefined;
}

export function brainLibraryFileId(kind: BrainDraftKind, slug?: string, name?: string): string {
  if (slug?.trim()) return `${kind}:${slug.trim()}`;
  const normalized = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `${kind}:new:${normalized}` : `${kind}:new`;
}

export function isBrainLibraryKind(value: unknown): value is BrainLibraryKind {
  return isBrainDraftKind(value);
}

export function brainDraftCanSave(draft: BrainDraft, builtInFollowUp?: boolean): boolean {
  if (draft.kind === 'skill' || draft.kind === 'agent') {
    return draft.name.trim().length > 0 && draft.content.trim().length > 0;
  }
  if (draft.kind === 'task') {
    return Boolean(draft.title.trim() && (draft.id || draft.name.trim()));
  }
  if (draft.kind !== 'follow-up') return false;
  return (
    draft.title.trim().length > 0 &&
    draft.prompt.trim().length > 0 &&
    (Boolean(draft.id) || draft.name.trim().length > 0 || Boolean(builtInFollowUp)) &&
    (draft.kindValue !== 'start-template' || Boolean(draft.template))
  );
}

export function brainLibraryFileCanAccept(file: BrainChangeFile, builtInFollowUp?: boolean): boolean {
  return brainDraftCanSave(file.draft, builtInFollowUp);
}

export function brainChangeSetCanAccept(set: BrainChangeSet): boolean {
  return set.files.some((file) => brainLibraryFileCanAccept(file));
}

function changeAction(draft: BrainDraft): 'create' | 'update' {
  return brainDraftIdentity(draft) ? 'update' : 'create';
}

export function draftToChangeFile(draft: BrainDraft, baseline?: BrainDraft): BrainChangeFile {
  const action = changeAction(draft);
  return {
    id: brainLibraryFileId(draft.kind, brainDraftIdentity(draft), draft.name),
    kind: draft.kind,
    action,
    draft,
    baseline: baseline ?? draft,
    dirtyKeys: [],
  };
}

function fileMatchesDraft(file: BrainChangeFile, draft: BrainDraft): boolean {
  if (file.kind !== draft.kind) return false;
  const proposedId = brainDraftIdentity(draft);
  const existingId = brainDraftIdentity(file.draft);
  if (proposedId && existingId) return proposedId === existingId;
  if (proposedId) return file.id === brainLibraryFileId(draft.kind, proposedId, draft.name);
  return file.id === brainLibraryFileId(draft.kind, existingId, draft.name) || file.draft.name === draft.name;
}

export function mergeProposedLibraryFiles(current: BrainChangeSet, proposed: BrainDraft[]): BrainChangeSet {
  if (proposed.length === 0) return current;
  const files = [...current.files];
  let selectedId = current.selectedId;
  for (const draft of proposed) {
    const index = files.findIndex((file) => fileMatchesDraft(file, draft));
    if (index >= 0) {
      const existing = files[index];
      if (!existing) continue;
      const merged = mergeBrainDraft(existing.draft, draft, new Set(existing.dirtyKeys));
      files[index] = {
        ...existing,
        kind: merged.kind,
        draft: merged,
        action: changeAction(merged) === 'update' ? 'update' : existing.action,
      };
      selectedId = files[index]?.id ?? selectedId;
      continue;
    }
    const next = draftToChangeFile(draft);
    files.push(next);
    selectedId = next.id;
  }
  return { files, selectedId: selectedId ?? files[0]?.id ?? null };
}

/** Drop a pending file (does not write disk or the catalog). */
export function undoBrainChangeFile(set: BrainChangeSet, fileId: string): BrainChangeSet {
  const remaining = set.files.filter((file) => file.id !== fileId);
  const keepSelected = set.selectedId && remaining.some((file) => file.id === set.selectedId);
  return { files: remaining, selectedId: keepSelected ? set.selectedId : remaining[0]?.id ?? null };
}

export function updateBrainChangeFile(
  set: BrainChangeSet,
  fileId: string,
  draft?: BrainDraft,
  dirtyKey?: string,
): BrainChangeSet {
  return {
    ...set,
    files: set.files.map((file) => {
      if (file.id !== fileId) return file;
      const dirtyKeys = dirtyKey && !file.dirtyKeys.includes(dirtyKey) ? [...file.dirtyKeys, dirtyKey] : file.dirtyKeys;
      return { ...file, draft: draft ?? file.draft, kind: (draft ?? file.draft).kind, dirtyKeys };
    }),
  };
}

export function selectBrainChangeFile(set: BrainChangeSet, fileId: string): BrainChangeSet {
  if (!set.files.some((file) => file.id === fileId)) return set;
  return { ...set, selectedId: fileId };
}

function unwrapToolObject(input: unknown): Record<string, unknown> | null {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return null;
}

export function parseBrainLibraryFiles(input: unknown): BrainDraft[] {
  const obj = unwrapToolObject(input);
  if (!obj) return [];
  const files: BrainDraft[] = [];
  const seen = new Set<string>();
  const pushDraft = (value: unknown) => {
    const draft = parseBrainDraft(value);
    if (!draft) return;
    const key = brainLibraryFileId(draft.kind, brainDraftIdentity(draft), draft.name);
    if (seen.has(key)) return;
    seen.add(key);
    files.push(draft);
  };
  if (Array.isArray(obj.files)) {
    for (const item of obj.files) {
      pushDraft(item);
    }
  }
  const nested = obj.draft && typeof obj.draft === 'object' ? obj.draft : obj;
  pushDraft(nested);
  return files;
}

export function latestBrainLibraryFilesFromMessages(messages: AssistantMessage[]): BrainDraft[] | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== 'tool' || msg.toolResult?.toolName !== 'propose_brain_draft') continue;
    if (msg.toolResult.isError) continue;
    const files = parseBrainLibraryFiles(msg.content);
    if (files.length > 0) return files;
  }
  return null;
}

export function formatReferencedSessionPrompt(sessions: SessionGradeListItem[], ask: string): string {
  const trimmed = ask.trim();
  if (sessions.length === 0) return trimmed;
  const lines = sessions.map((session) => {
    const score = session.score == null ? 'ungraded' : `score ${session.score}`;
    const findings = session.findingTitles.length > 0 ? `; findings: ${session.findingTitles.join(', ')}` : '';
    return `- ${session.id} (${session.title || 'untitled'}, ${score}${findings})`;
  });
  return [
    'Referenced analyzed sessions:',
    ...lines,
    'Load each with get_session_grade before drafting. Propose skill, agent, task, and/or follow-up changes with propose_brain_draft (files array). Do not write them yourself.',
    '',
    trimmed,
  ].join('\n');
}
