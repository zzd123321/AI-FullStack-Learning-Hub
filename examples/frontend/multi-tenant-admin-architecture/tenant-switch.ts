export interface TenantRuntime {
  readonly abortRequests: () => void;
  readonly closeRealtime: () => void;
  readonly clearSensitiveCaches: () => Promise<void>;
  readonly resetStores: () => void;
  readonly navigate: (path: string) => Promise<void>;
}

export async function switchTenant(
  runtime: TenantRuntime,
  next: TenantContext,
): Promise<void> {
  runtime.abortRequests();
  runtime.closeRealtime();
  await runtime.clearSensitiveCaches();
  runtime.resetStores();
  await runtime.navigate(`/t/${encodeURIComponent(next.tenantId)}`);
}
import type { TenantContext } from './tenant-context.js';
