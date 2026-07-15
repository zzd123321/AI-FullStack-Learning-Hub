import type { TranscriptSegment } from './types.js';

export function upsertTranscript(
  segments: readonly TranscriptSegment[],
  next: TranscriptSegment,
): readonly TranscriptSegment[] {
  const index = segments.findIndex((segment) => segment.id === next.id);
  if (index < 0) return [...segments, next];
  if (segments[index]!.status === 'final' && next.status === 'partial') return segments;
  return [...segments.slice(0, index), next, ...segments.slice(index + 1)];
}
export function confirmedTranscript(segments: readonly TranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.status === 'final')
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join('\n');
}
