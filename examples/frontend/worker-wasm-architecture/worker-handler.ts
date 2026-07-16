import { cooperativeSum } from './cooperative-sum.js';
import { isComputeRequest, type ComputeResponse } from './task-protocol.js';

interface WorkerScopeLike {
  postMessage(message: ComputeResponse): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

export function installComputeHandler(scope: WorkerScopeLike): void {
  const cancelled = new Set<string>();
  scope.addEventListener('message', (event) => {
    if (!isComputeRequest(event.data)) return;
    const request = event.data;
    if (request.type === 'cancel') {
      cancelled.add(request.targetId);
      return;
    }
    void cooperativeSum(request.values, () => cancelled.has(request.id))
      .then((result) => scope.postMessage({ version: 1, id: request.id, ok: true, result }))
      .catch((error: unknown) => scope.postMessage({
        version: 1, id: request.id, ok: false,
        error: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed',
      }))
      .finally(() => cancelled.delete(request.id));
  });
}
