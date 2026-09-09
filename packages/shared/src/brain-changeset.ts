import type { AssistantMessage } from './assistant.js';
import type { ChatSession, ChatSessionTemplateId, SessionGradeScore } from './chat-session.js';
import {
  mergeBrainDraft,
  parseBrainDraft,
  type BrainMarkdownDraft,
} from './brain.js';

export type BrainLibraryKind = 'skill' | 'agent';

export interface BrainLibraryFileSnapshot {
  name: string;
  description: string;
  content: string;
}

export interface BrainChangeFile {
  id: string;
  kind: BrainLibraryKind;
  action: 'create' | 'update';
  slug?: string;
  name: string;
  description: string;
  content: string;
  rationale?: string;
  baseline: BrainLibraryFileSnapshot;
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

export function brainLibraryFileId(kind: BrainLibraryKind, slug?: string, name?: string): string {
  if (slug?.trim()) return `${kind}:${slug.trim()}`;
  const normalized = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `${kind}:new:${normalized}` : `${kind}:new`;
}

export function isBrainLibraryKind(value: unknown): value is BrainLibraryKind {
  return value === 'skill' || value === 'agent';
}

export function brainLibraryFileCanAccept(file: BrainChangeFile): boolean {
  return file.name.trim().length > 0 && file.content.trim().length > 0;
}

export function brainChangeSetCanAccept(set: BrainChangeSet): boolean {
  return set.files.some((file) => brainLibraryFileCanAccept(file));
}

export function draftToChangeFile(
  draft: BrainMarkdownDraft,
  baseline?: BrainLibraryFileSnapshot,
): BrainChangeFile {
  const action = draft.slug ? 'update' : 'create';
  const snapshot: BrainLibraryFileSnapshot = baseline ?? {
    name: action === 'update' ? draft.name : '',
    description: action === 'update' ? draft.description : '',
    content: action === 'update' ? draft.content : '',
  };
  return {
    id: brainLibraryFileId(draft.kind, draft.slug, draft.name),
    kind: draft.kind,
    action,
    slug: draft.slug,
    name: draft.name,
    description: draft.description,
    content: draft.content,
    rationale: draft.rationale,
    baseline: snapshot,
    dirtyKeys: [],
  };
}

function fileMatchesDraft(file: BrainChangeFile, draft: BrainMarkdownDraft): boolean {
  if (file.kind !== draft.kind) return false;
  if (draft.slug && file.slug) return file.slug === draft.slug;
  if (draft.slug) return file.id === brainLibraryFileId(draft.kind, draft.slug, draft.name);
  return file.id === brainLibraryFileId(draft.kind, file.slug, draft.name) || file.name === draft.name;
}

export function mergeProposedLibraryFiles(
  current: BrainChangeSet,
  proposed: BrainMarkdownDraft[],
): BrainChangeSet {
  if (proposed.length === 0) return current;
  const files = [...current.files];
  let selectedId = current.selectedId;
  for (const draft of proposed) {
    const index = files.findIndex((file) => fileMatchesDraft(file, draft));
    if (index >= 0) {
      const existing = files[index];
      if (!existing) continue;
      const currentDraft: BrainMarkdownDraft = {
        kind: existing.kind,
        slug: existing.slug,
        name: existing.name,
        description: existing.description,
        content: existing.content,
      };
      const merged = mergeBrainDraft(currentDraft, draft, new Set(existing.dirtyKeys));
      if (merged.kind !== 'skill' && merged.kind !== 'agent') continue;
      files[index] = {
        ...existing,
        name: merged.name,
        description: merged.description,
        content: merged.content,
        rationale: merged.rationale ?? existing.rationale,
        slug: merged.slug ?? existing.slug,
        action: merged.slug ? 'update' : existing.action,
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

/** Drop a new file, or discard a pending update (does not write disk). */
export function undoBrainChangeFile(set: BrainChangeSet, fileId: string): BrainChangeSet {
  const remaining = set.files.filter((file) => file.id !== fileId);
  const keepSelected = set.selectedId && remaining.some((file) => file.id === set.selectedId);
  return { files: remaining, selectedId: keepSelected ? set.selectedId : remaining[0]?.id ?? null };
}

export function updateBrainChangeFile(
  set: BrainChangeSet,
  fileId: string,
  patch: Partial<Pick<BrainChangeFile, 'name' | 'description' | 'content' | 'rationale'>>,
  dirtyKey?: string,
): BrainChangeSet {
  return {
    ...set,
    files: set.files.map((file) => {
      if (file.id !== fileId) return file;
      const dirtyKeys = dirtyKey && !file.dirtyKeys.includes(dirtyKey) ? [...file.dirtyKeys, dirtyKey] : file.dirtyKeys;
      return { ...file, ...patch, dirtyKeys };
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

export function parseBrainLibraryFiles(input: unknown): BrainMarkdownDraft[] {
  const obj = unwrapToolObject(input);
  if (!obj) return [];
  const files: BrainMarkdownDraft[] = [];
  const seen = new Set<string>();
  const pushDraft = (value: unknown) => {
    const draft = parseBrainDraft(value);
    if (!draft || (draft.kind !== 'skill' && draft.kind !== 'agent')) return;
    const key = brainLibraryFileId(draft.kind, draft.slug, draft.name);
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

export function latestBrainLibraryFilesFromMessages(messages: AssistantMessage[]): BrainMarkdownDraft[] | null {
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
    'Load each with get_session_grade before drafting. Propose personal skill and/or agent file changes with propose_brain_draft (files array). Do not write files yourself.',
    '',
    trimmed,
  ].join('\n');
}
