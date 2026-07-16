export interface PastedParagraph {
  readonly type: 'paragraph';
  readonly text: string;
}

export function plainTextToParagraphs(input: string, maxCharacters = 100_000): readonly PastedParagraph[] {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 0) {
    throw new RangeError('maxCharacters must be a non-negative safe integer');
  }
  const normalized = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n').slice(0, maxCharacters);
  return normalized.split(/\n{2,}/u)
    .map((text) => text.replaceAll('\n', ' ').trim())
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', text }));
}
