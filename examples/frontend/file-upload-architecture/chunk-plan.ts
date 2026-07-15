import type { UploadPart } from './types.js';

export function planParts(fileSize: number, partSize: number): UploadPart[] {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) throw new RangeError('Invalid file size');
  if (!Number.isSafeInteger(partSize) || partSize <= 0) throw new RangeError('Invalid part size');
  const parts: UploadPart[] = [];
  for (let start = 0, partNumber = 1; start < fileSize; start += partSize, partNumber += 1) {
    const end = Math.min(start + partSize, fileSize);
    parts.push({ partNumber, start, end, size: end - start });
  }
  return parts;
}

export function weakFileFingerprint(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return JSON.stringify([file.name, file.size, file.lastModified]);
}
