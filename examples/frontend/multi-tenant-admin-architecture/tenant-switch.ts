import type { TenantContext } from './tenant-context.js';

export interface TenantScope {
  readonly context: TenantContext;
  readonly generation: number;
}

export interface ScopedMessage {
  readonly subjectId: string;
  readonly tenantId: string;
  readonly generation: number;
}

export class TenantScopeCoordinator {
  #generation = 0;
  #active: TenantScope | null = null;

  current(): TenantScope | null { return this.#active; }

  invalidate(): void {
    this.#generation += 1;
    this.#active = null;
  }

  activate(context: TenantContext): TenantScope {
    this.#generation += 1;
    this.#active = { context, generation: this.#generation };
    return this.#active;
  }

  accepts(message: ScopedMessage): boolean {
    const active = this.#active;
    return active !== null
      && message.subjectId === active.context.subjectId
      && message.tenantId === active.context.tenantId
      && message.generation === active.generation;
  }
}

export interface TenantRuntime {
  readonly abortRequests: () => void;
  readonly closeRealtime: () => void;
  readonly clearSensitiveCaches: () => Promise<void>;
  readonly resetStores: () => void;
  readonly navigate: (path: string) => Promise<void>;
}

export async function switchTenant(
  runtime: TenantRuntime,
  coordinator: TenantScopeCoordinator,
  next: TenantContext,
): Promise<TenantScope> {
  // Invalidate first so a response that wins the abort race is already stale.
  coordinator.invalidate();
  const cleanup = await Promise.allSettled([
    Promise.resolve().then(runtime.abortRequests),
    Promise.resolve().then(runtime.closeRealtime),
    Promise.resolve().then(runtime.clearSensitiveCaches),
  ]);
  const failures = cleanup.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length > 0) throw new AggregateError(failures, 'Tenant cleanup failed');

  runtime.resetStores();
  const scope = coordinator.activate(next);
  try {
    await runtime.navigate(`/t/${encodeURIComponent(next.tenantId)}`);
    return scope;
  } catch (error) {
    coordinator.invalidate();
    throw error;
  }
}
