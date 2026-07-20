export interface FilePolicy {
  readonly maxBytes: number;
  readonly allowedExtensions: ReadonlySet<string>;
  readonly allowedKinds: ReadonlySet<DetectedKind>;
}

export type DetectedKind = 'jpeg' | 'png' | 'pdf' | 'zip' | 'iso-bmff' | 'unknown';

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((value, index) => bytes[index] === value);

export async function detectKind(file: Blob): Promise<DetectedKind> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  // `ftyp` identifies the ISO Base Media family, not MP4 specifically. HEIF,
  // QuickTime and other formats can share this box structure.
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp') return 'iso-bmff';
  return 'unknown';
}

export async function validateFile(file: File, policy: FilePolicy): Promise<DetectedKind> {
  if (file.size === 0) throw new Error('文件为空');
  if (file.size > policy.maxBytes) throw new Error('文件超过大小限制');
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!policy.allowedExtensions.has(extension)) throw new Error('文件扩展名不受支持');
  const kind = await detectKind(file);
  if (!policy.allowedKinds.has(kind)) throw new Error('文件内容特征不受支持');
  return kind;
}
