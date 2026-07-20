import { cooperativeSum } from './cooperative-sum.js';
import { parseComputeRequest, type ComputeResponse } from './task-protocol.js';

export interface WorkerScopeLike {
  postMessage(message: ComputeResponse): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
}

export function installComputeHandler(scope: WorkerScopeLike, maximumActiveTasks = 1): void {
  if (!Number.isInteger(maximumActiveTasks) || maximumActiveTasks < 1) {
    throw new RangeError('maximumActiveTasks must be a positive integer');
  }

  const active = new Set<string>();
  const cancelled = new Set<string>();

  scope.addEventListener('message', (event) => {
    const request = parseComputeRequest(event.data);
    if (!request) return;

    if (request.type === 'cancel') {
      // Ignore cancellation for unknown/finished IDs, otherwise arbitrary
      // cancel messages would accumulate forever in memory.
      if (active.has(request.targetId)) cancelled.add(request.targetId);
      return;
    }
    if (active.has(request.id)) {
      scope.postMessage({ version: 1, id: request.id, ok: false, error: 'invalid-request' });
      return;
    }
    if (active.size >= maximumActiveTasks) {
      scope.postMessage({ version: 1, id: request.id, ok: false, error: 'busy' });
      return;
    }

    active.add(request.id);
    void cooperativeSum(request.values, () => cancelled.has(request.id))
      .then((result) => scope.postMessage(
        Number.isFinite(result)
          ? { version: 1, id: request.id, ok: true, result }
          : { version: 1, id: request.id, ok: false, error: 'failed' },
      ))
      .catch((error: unknown) => scope.postMessage({
        version: 1,
        id: request.id,
        ok: false,
        error: error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed',
      }))
      .finally(() => {
        active.delete(request.id);
        cancelled.delete(request.id);
      });
  });
}
