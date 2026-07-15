export interface PartUploadRequest {
  readonly url: string;
  readonly body: Blob;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly onProgress: (loadedBytes: number) => void;
}

export function uploadPartWithXhr(request: PartUploadRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => request.signal.removeEventListener('abort', abort);
    xhr.open('PUT', request.url);
    Object.entries(request.headers ?? {}).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) request.onProgress(event.loaded);
    });
    xhr.addEventListener('load', () => {
      cleanup();
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(Object.assign(new Error(`Part upload failed: ${xhr.status}`), { status: xhr.status }));
        return;
      }
      const etag = xhr.getResponseHeader('ETag');
      if (!etag) reject(new Error('Upload response did not expose ETag'));
      else resolve(etag);
    });
    xhr.addEventListener('error', () => { cleanup(); reject(new TypeError('Network error')); });
    xhr.addEventListener('abort', () => { cleanup(); reject(request.signal.reason); });
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    else xhr.send(request.body);
  });
}
