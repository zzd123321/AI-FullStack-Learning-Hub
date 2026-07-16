export interface TextDocument {
  readonly version: number;
  readonly blocks: Readonly<Record<string, string>>;
}

export interface ReplaceTextStep {
  readonly blockId: string;
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

function isUtf16Boundary(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return true;
  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff);
}

export function applyReplaceText(document: TextDocument, step: ReplaceTextStep): TextDocument {
  const current = document.blocks[step.blockId];
  if (current === undefined || !Number.isInteger(step.from) || !Number.isInteger(step.to)
    || step.from < 0 || step.to < step.from || step.to > current.length
    || !isUtf16Boundary(current, step.from) || !isUtf16Boundary(current, step.to)
    || step.text.length > 100_000) {
    throw new RangeError('Invalid replace-text step');
  }
  return {
    version: document.version + 1,
    blocks: { ...document.blocks,
      [step.blockId]: `${current.slice(0, step.from)}${step.text}${current.slice(step.to)}` },
  };
}
