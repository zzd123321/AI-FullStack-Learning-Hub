export interface ImportFilePolicy {
  readonly maxBytes: number;
  readonly extensions: ReadonlySet<string>;
  readonly mediaTypes: ReadonlySet<string>;
}

export interface FileDescriptor {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export type PreflightResult =
  | { readonly accepted: true; readonly extension: string }
  | { readonly accepted: false; readonly reason: 'empty' | 'too_large' | 'extension' | 'media_type' };

export function preflightFile(file: FileDescriptor, policy: ImportFilePolicy): PreflightResult {
  if (file.size <= 0) return { accepted: false, reason: 'empty' };
  if (file.size > policy.maxBytes) return { accepted: false, reason: 'too_large' };
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!policy.extensions.has(extension)) return { accepted: false, reason: 'extension' };
  if (file.type && !policy.mediaTypes.has(file.type.toLowerCase())) {
    return { accepted: false, reason: 'media_type' };
  }
  return { accepted: true, extension };
}
