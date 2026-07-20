import { parseComputeRequest, type ComputeResponse } from './task-protocol.js';
import { WasmMemoryReader } from './wasm-memory-view.js';
import { ComputeWorkerClient, type WorkerLike } from './worker-client.js';
import { installComputeHandler, type WorkerScopeLike } from './worker-handler.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type MessageListener = (event: MessageEvent<unknown>) => void;
type FailureListener = (event: Event) => void;

const messageListeners = new Set<MessageListener>();
const errorListeners = new Set<FailureListener>();
const messageErrorListeners = new Set<FailureListener>();
const received: unknown[] = [];
let terminated = false;

const worker: WorkerLike = {
  postMessage(message, transfer = []) {
    // structuredClone gives this test the browser's real detachment semantics.
    received.push(structuredClone(message, { transfer }));
  },
  terminate() { terminated = true; },
  addEventListener(type, listener: MessageListener | FailureListener) {
    if (type === 'message') messageListeners.add(listener as MessageListener);
    else if (type === 'error') errorListeners.add(listener as FailureListener);
    else messageErrorListeners.add(listener as FailureListener);
  },
  removeEventListener(type, listener: MessageListener | FailureListener) {
    if (type === 'message') messageListeners.delete(listener as MessageListener);
    else if (type === 'error') errorListeners.delete(listener as FailureListener);
    else messageErrorListeners.delete(listener as FailureListener);
  },
};

function emitResponse(response: ComputeResponse): void {
  const event = { data: response } as MessageEvent<unknown>;
  for (const listener of messageListeners) listener(event);
}

const client = new ComputeWorkerClient(worker);
const values = new Float64Array([1, 2, 3]);
const sum = client.sumTransferred(values);
assert(values.byteLength === 0, 'transfer should detach the sender buffer');
const request = parseComputeRequest(received[0]);
assert(request?.type === 'sum', 'worker should receive a valid sum request');
emitResponse({ version: 1, id: request.id, ok: true, result: 6 });
assert(await sum === 6, 'correlated worker response should settle the task');

const controller = new AbortController();
const cancelledValues = new Float64Array([4, 5]);
const cancelled = client.sumTransferred(cancelledValues, { signal: controller.signal });
const cancelledRequest = parseComputeRequest(received[1]);
assert(cancelledRequest?.type === 'sum', 'second sum request should be sent');
controller.abort();
await cancelled.then(
  () => { throw new Error('aborted task should reject'); },
  (error: unknown) => assert(error instanceof DOMException && error.name === 'AbortError', 'abort error is stable'),
);
emitResponse({ version: 1, id: cancelledRequest.id, ok: false, error: 'cancelled' });

// memory.grow detaches the old buffer; the helper reads memory.buffer again.
const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 });
new Uint8Array(memory.buffer)[0] = 42;
const reader = new WasmMemoryReader(memory);
const beforeGrow = reader.copyBytes(0, 1);
memory.grow(1);
assert(beforeGrow[0] === 42, 'copied result survives memory growth');
assert(reader.copyBytes(0, 1)[0] === 42, 'reader refreshes the memory buffer');

let handlerInstalled = false;
let handleWorkerMessage: (event: MessageEvent<unknown>) => void = () => {
  throw new Error('worker handler was not installed');
};
const handlerResponses: ComputeResponse[] = [];
const scope: WorkerScopeLike = {
  postMessage(response) { handlerResponses.push(response); },
  addEventListener(_type, listener) {
    handlerInstalled = true;
    handleWorkerMessage = listener;
  },
};
installComputeHandler(scope);
assert(handlerInstalled, 'worker handler should subscribe to messages');
handleWorkerMessage({ data: {
  version: 1, id: 'handler-1', type: 'sum', values: new Float64Array([1, 2, 3]),
} } as MessageEvent<unknown>);
handleWorkerMessage({ data: {
  version: 1, id: 'handler-2', type: 'sum', values: new Float64Array([4]),
} } as MessageEvent<unknown>);
handleWorkerMessage({ data: {
  version: 1, id: 'cancel-1', type: 'cancel', targetId: 'handler-1',
} } as MessageEvent<unknown>);
await new Promise<void>((resolve) => setTimeout(resolve, 10));
assert(
  handlerResponses.some((response) => response.id === 'handler-2' && !response.ok && response.error === 'busy'),
  'one compute worker should apply local backpressure',
);
assert(
  handlerResponses.some((response) => response.id === 'handler-1' && !response.ok && response.error === 'cancelled'),
  'cancel received during final yield should win before result publication',
);

client.dispose();
assert(terminated, 'dispose should terminate the owned worker');
assert(messageListeners.size === 0, 'dispose should remove worker listeners');

console.log('worker runtime and Wasm memory examples passed');
