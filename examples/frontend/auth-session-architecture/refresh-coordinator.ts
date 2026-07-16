export class RefreshCoordinator {
  #inFlight: Promise<boolean> | null = null;

  refresh(run: () => Promise<boolean>): Promise<boolean> {
    if (this.#inFlight) return this.#inFlight;
    this.#inFlight = run().finally(() => { this.#inFlight = null; });
    return this.#inFlight;
  }
}

export async function fetchWithOneRefresh(
  send: () => Promise<Response>,
  coordinator: RefreshCoordinator,
  refresh: () => Promise<boolean>,
): Promise<Response> {
  const first = await send();
  if (first.status !== 401) return first;
  if (!await coordinator.refresh(refresh)) return first;
  return send();
}
