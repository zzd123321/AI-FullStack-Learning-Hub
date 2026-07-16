export type InlineNode =
  | { readonly type: 'text'; readonly text: string; readonly marks?: readonly ('bold' | 'italic' | 'code')[] }
  | { readonly type: 'link'; readonly href: string; readonly children: readonly InlineNode[] };

export type BlockNode =
  | { readonly id: string; readonly type: 'paragraph'; readonly children: readonly InlineNode[] }
  | { readonly id: string; readonly type: 'heading'; readonly level: 2 | 3; readonly children: readonly InlineNode[] }
  | { readonly id: string; readonly type: 'image'; readonly assetId: string; readonly alt: string };

export interface ContentDocument {
  readonly schemaVersion: 'content-v1';
  readonly blocks: readonly BlockNode[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isContentDocument(value: unknown): value is ContentDocument {
  if (!isRecord(value) || value.schemaVersion !== 'content-v1'
    || !Array.isArray(value.blocks) || value.blocks.length > 2_000) return false;
  const ids = new Set<string>();
  let remainingNodes = 20_000;
  const isInline = (node: unknown, depth: number, insideLink = false): boolean => {
    if (--remainingNodes < 0 || depth > 20 || !isRecord(node)) return false;
    if (node.type === 'text') {
      return typeof node.text === 'string' && node.text.length <= 100_000
        && (node.marks === undefined || (Array.isArray(node.marks) && node.marks.length <= 3
          && new Set(node.marks).size === node.marks.length
          && node.marks.every((mark) => mark === 'bold' || mark === 'italic' || mark === 'code')));
    }
    return !insideLink && node.type === 'link' && typeof node.href === 'string' && node.href.length <= 2_000
      && Array.isArray(node.children) && node.children.length <= 5_000
      && node.children.every((child) => isInline(child, depth + 1, true));
  };
  return value.blocks.every((block) => {
    if (--remainingNodes < 0 || !isRecord(block) || typeof block.id !== 'string'
      || !/^[a-zA-Z0-9_-]{1,100}$/.test(block.id) || ids.has(block.id)) return false;
    ids.add(block.id);
    if (block.type === 'image') {
      return typeof block.assetId === 'string' && block.assetId.length <= 200
        && typeof block.alt === 'string' && block.alt.length <= 1_000;
    }
    return (block.type === 'paragraph' || block.type === 'heading')
      && (block.type !== 'heading' || block.level === 2 || block.level === 3)
      && Array.isArray(block.children) && block.children.length <= 5_000
      && block.children.every((child) => isInline(child, 0));
  });
}
