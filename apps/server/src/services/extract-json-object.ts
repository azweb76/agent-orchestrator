/** Pull a JSON object out of model text that may include prose, fences, or loose JS-style keys. */

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function tryJsonParse(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function findMatchingBrace(text: string, start: number): number | null {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quote) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

function extractBalancedObjects(text: string): string[] {
  const objects: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    const end = findMatchingBrace(text, i);
    if (end == null) continue;
    objects.push(text.slice(i, end + 1));
    i = end;
  }
  return objects;
}

function fencedBlocks(text: string): string[] {
  return [...text.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi)].map((match) =>
    match[1]!.trim(),
  );
}

/** Quote keys, convert single-quoted strings, and drop trailing commas outside of strings. */
export function repairLooseJson(text: string): string {
  const source = text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  let out = '';
  let i = 0;
  let inString = false;
  let escape = false;

  while (i < source.length) {
    const ch = source[i]!;
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "'") {
      i += 1;
      let content = '';
      while (i < source.length) {
        const inner = source[i]!;
        if (inner === '\\' && i + 1 < source.length) {
          content += source[i + 1];
          i += 2;
          continue;
        }
        if (inner === "'") {
          i += 1;
          break;
        }
        content += inner;
        i += 1;
      }
      out += JSON.stringify(content);
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < source.length && /\s/.test(source[j]!)) j += 1;
      if (source[j] === '}' || source[j] === ']') {
        i += 1;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j]!)) j += 1;
      let k = j;
      while (k < source.length && /\s/.test(source[k]!)) k += 1;
      if (source[k] === ':') {
        out += `"${source.slice(i, j)}"`;
        i = j;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

function tryParseObject(text: string): Record<string, unknown> | null {
  for (const candidate of [text, repairLooseJson(text)]) {
    try {
      let value = tryJsonParse(candidate);
      if (typeof value === 'string') {
        try {
          value = tryJsonParse(value);
        } catch {
          // keep the string parse result only if it was already an object
        }
      }
      const object = asObject(value);
      if (object) return object;
    } catch {
      // try the next repair
    }
  }
  return null;
}

function candidateScore(text: string): number {
  let score = Math.min(text.length, 800) / 800;
  if (/"?summary"?\s*:/.test(text)) score += 3;
  if (/"?findings"?\s*:/.test(text)) score += 3;
  if (/"?score"?\s*:/.test(text)) score += 2;
  if (/"?content"?\s*:/.test(text)) score += 2;
  return score;
}

export function extractJsonObject(raw: unknown, label = 'response'): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') {
    throw new Error(`${label} was not a JSON object`);
  }

  const trimmed = raw.trim();
  const blobs = [...fencedBlocks(trimmed), trimmed].filter(Boolean);
  const objects: string[] = [];

  for (const blob of blobs) {
    const parsed = tryParseObject(blob);
    if (parsed) return parsed;
    objects.push(...extractBalancedObjects(blob));
  }

  const ranked = [...new Set(objects)].sort((a, b) => candidateScore(b) - candidateScore(a));
  for (const object of ranked) {
    const parsed = tryParseObject(object);
    if (parsed) return parsed;
  }

  throw new Error(`${label} was not valid JSON`);
}
