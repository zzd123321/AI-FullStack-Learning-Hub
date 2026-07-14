/// <reference lib="webworker" />

import { isPrimeRequest, type PrimeResponse } from "./worker-protocol.js";

function findPrimes(maximum: number): number[] {
  const primes: number[] = [];
  outer: for (let candidate = 2; candidate <= maximum; candidate += 1) {
    const limit = Math.sqrt(candidate);
    for (const prime of primes) {
      if (prime > limit) break;
      if (candidate % prime === 0) continue outer;
    }
    primes.push(candidate);
  }
  return primes;
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isPrimeRequest(event.data)) return;

  try {
    const primes = findPrimes(event.data.maximum);
    const response: PrimeResponse = {
      type: "prime-result",
      requestId: event.data.requestId,
      count: primes.length,
      largest: primes.at(-1) ?? null,
    };
    self.postMessage(response);
  } catch (error) {
    const response: PrimeResponse = {
      type: "prime-error",
      requestId: event.data.requestId,
      message: error instanceof Error ? error.message : "Unknown worker error",
    };
    self.postMessage(response);
  }
});
