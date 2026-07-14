import { isPrimeResponse, type PrimeRequest, type PrimeSuccess } from "./worker-protocol.js";

export function findPrimesInWorker(maximum: number, signal?: AbortSignal): Promise<PrimeSuccess> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./prime-worker.js", import.meta.url), { type: "module" });
    const requestId = crypto.randomUUID();

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Operation aborted", "AbortError"));
    };

    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isPrimeResponse(event.data) || event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.type === "prime-error") reject(new Error(event.data.message));
      else resolve(event.data);
    });
    worker.addEventListener("error", (event) => {
      cleanup();
      reject(new Error(event.message || "Worker failed"));
    });

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    const request: PrimeRequest = { type: "find-primes", requestId, maximum };
    worker.postMessage(request);
  });
}
