export interface SelectionPoint {
  readonly blockId: string;
  readonly offset: number;
}

export interface SelectionBookmark {
  readonly anchor: SelectionPoint;
  readonly focus: SelectionPoint;
}

export function restorePoint(
  point: SelectionPoint,
  blockText: Readonly<Record<string, string>>,
  fallbackBlockId: string,
): SelectionPoint {
  const text = blockText[point.blockId];
  if (text !== undefined) {
    return { blockId: point.blockId, offset: Math.min(Math.max(0, point.offset), text.length) };
  }
  const fallback = blockText[fallbackBlockId] ?? '';
  return { blockId: fallbackBlockId, offset: fallback.length };
}
