export class RefreshCoordinator {
  #inFlight: Promise<boolean> | null = null;

  refresh(run: () => Promise<boolean>): Promise<boolean> {
    if (this.#inFlight) return this.#inFlight;
    // Promise.resolve().then(run) also converts a synchronous throw from run
    // into a rejected Promise, so every caller observes the same outcome.
    const refresh = Promise.resolve().then(run);
    const tracked = refresh.finally(() => {
      // Do not let an older completion clear a newer refresh operation.
      if (this.#inFlight === tracked) this.#inFlight = null;
    });
    this.#inFlight = tracked;
    return tracked;
  }
}

export interface RefreshRetryPolicy {
  /** The request body and idempotency semantics make one replay safe. */
  readonly canReplay: boolean;
  /** Distinguish an expired session from unrelated 401 responses. */
  shouldRefresh(response: Response): boolean;
}

export async function fetchWithOneRefresh(
  send: () => Promise<Response>,
  coordinator: RefreshCoordinator,
  refresh: () => Promise<boolean>,
  policy: RefreshRetryPolicy,
): Promise<Response> {
  const first = await send();
  if (!policy.canReplay || !policy.shouldRefresh(first)) return first;
  if (!await coordinator.refresh(refresh)) return first;

  // The caller will use the replayed response, so release the unused body of
  // the first response. Failure to cancel it must not block the replay.
  try { await first.body?.cancel(); } catch { /* body may already be closed */ }
  return send();
}
