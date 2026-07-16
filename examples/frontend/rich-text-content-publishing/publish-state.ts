export type PublicationPhase = 'draft' | 'review' | 'scheduled' | 'published' | 'archived';

export interface PublicationView {
  readonly contentId: string;
  readonly version: number;
  readonly contentRevision: number;
  readonly phase: PublicationPhase;
  readonly publishedRevision: number | null;
  readonly allowedCommands: readonly ('save' | 'submit_review' | 'schedule' | 'publish' | 'archive')[];
}

export function applyPublicationSnapshot(
  current: PublicationView,
  incoming: PublicationView,
): PublicationView {
  if (incoming.contentId !== current.contentId) throw new TypeError('Content mismatch');
  return incoming.version > current.version ? incoming : current;
}
