import { weakFileFingerprint } from './chunk-plan.js';
import type { CompletedPart } from './types.js';

export interface ResumeRecord {
  readonly fingerprint: string;
  readonly uploadId: string;
  readonly assetId: string;
  readonly completedParts: readonly CompletedPart[];
  readonly updatedAt: number;
}

const KEY_PREFIX = 'multipart-upload:';

export function saveResumeRecord(file: File, record: Omit<ResumeRecord, 'fingerprint' | 'updatedAt'>): void {
  const fingerprint = weakFileFingerprint(file);
  localStorage.setItem(KEY_PREFIX + fingerprint, JSON.stringify({
    ...record, fingerprint, updatedAt: Date.now(),
  } satisfies ResumeRecord));
}

export function loadResumeRecord(file: File): ResumeRecord | null {
  const fingerprint = weakFileFingerprint(file);
  const raw = localStorage.getItem(KEY_PREFIX + fingerprint);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const candidate = value as Partial<ResumeRecord>;
    return candidate.fingerprint === fingerprint
      && typeof candidate.uploadId === 'string'
      && typeof candidate.assetId === 'string'
      && Array.isArray(candidate.completedParts)
      && typeof candidate.updatedAt === 'number'
      ? candidate as ResumeRecord : null;
  } catch {
    return null;
  }
}

export function removeResumeRecord(file: File): void {
  localStorage.removeItem(KEY_PREFIX + weakFileFingerprint(file));
}
