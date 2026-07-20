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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadResumeRecord(
  file: File,
  now = Date.now(),
  maximumAgeMs = 7 * 24 * 60 * 60 * 1_000,
): ResumeRecord | null {
  if (!Number.isFinite(now) || !Number.isFinite(maximumAgeMs) || maximumAgeMs < 0) return null;
  const fingerprint = weakFileFingerprint(file);
  const raw = localStorage.getItem(KEY_PREFIX + fingerprint);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.fingerprint !== fingerprint) return null;
    if (typeof value.uploadId !== 'string' || value.uploadId === '') return null;
    if (typeof value.assetId !== 'string' || value.assetId === '') return null;
    if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
    if (value.updatedAt > now || now - value.updatedAt > maximumAgeMs) return null;
    if (!Array.isArray(value.completedParts) || value.completedParts.length > 10_000) return null;

    const completedParts: CompletedPart[] = [];
    const seen = new Set<number>();
    for (const part of value.completedParts) {
      if (!isRecord(part) || !Number.isSafeInteger(part.partNumber) || Number(part.partNumber) < 1) return null;
      if (typeof part.etag !== 'string' || part.etag === '' || seen.has(Number(part.partNumber))) return null;
      seen.add(Number(part.partNumber));
      completedParts.push({ partNumber: Number(part.partNumber), etag: part.etag });
    }
    return {
      fingerprint,
      uploadId: value.uploadId,
      assetId: value.assetId,
      completedParts,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

export function removeResumeRecord(file: File): void {
  localStorage.removeItem(KEY_PREFIX + weakFileFingerprint(file));
}
