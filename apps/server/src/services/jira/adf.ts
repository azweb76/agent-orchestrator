/** Convert Atlassian Document Format (ADF) nodes to plain text. */
export function adfToPlainText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return '';

  const value = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };

  if (value.type === 'text') return value.text ?? '';
  if (value.type === 'hardBreak' || value.type === 'rule') return '\n';

  const children = (value.content ?? []).map(adfToPlainText).join('');

  switch (value.type) {
    case 'paragraph':
    case 'heading':
    case 'blockquote':
      return `${children.trimEnd()}\n\n`;
    case 'listItem':
      return `- ${children.trim()}\n`;
    case 'codeBlock':
      return `\`\`\`\n${children.trimEnd()}\n\`\`\`\n\n`;
    case 'bulletList':
    case 'orderedList':
      return `${children.trimEnd()}\n\n`;
    default:
      return children;
  }
}

export function normalizeDescription(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return adfToPlainText(value).trim();
}
