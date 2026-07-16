export interface HighlightRange {
  readonly start: number;
  readonly end: number;
}

export interface TextSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

const isUtf16Boundary = (text: string, index: number): boolean => {
  if (index <= 0 || index >= text.length) return true;
  const previous = text.charCodeAt(index - 1);
  const current = text.charCodeAt(index);
  return !(previous >= 0xD800 && previous <= 0xDBFF
    && current >= 0xDC00 && current <= 0xDFFF);
};

export function buildHighlightSegments(
  text: string,
  ranges: readonly HighlightRange[],
): readonly TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
      || range.start < cursor || range.end <= range.start || range.end > text.length
      || !isUtf16Boundary(text, range.start) || !isUtf16Boundary(text, range.end)) {
      throw new RangeError('Invalid highlight ranges');
    }
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), highlighted: false });
    segments.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false });
  return segments;
}
