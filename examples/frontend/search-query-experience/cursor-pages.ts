export interface SearchHit {
  readonly id: string;
  readonly title: string;
}

export interface SearchPage {
  readonly queryFingerprint: string;
  readonly hits: readonly SearchHit[];
  readonly nextCursor: string | null;
  readonly snapshotExpiresAt?: number;
}

export function appendPage(
  current: readonly SearchHit[],
  page: SearchPage,
  expectedFingerprint: string,
): readonly SearchHit[] {
  if (page.queryFingerprint !== expectedFingerprint) throw new TypeError('Query fingerprint mismatch');
  const byId = new Map(current.map((hit) => [hit.id, hit]));
  page.hits.forEach((hit) => byId.set(hit.id, hit));
  return [...byId.values()];
}
