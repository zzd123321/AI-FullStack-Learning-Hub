export interface StorageCapacity {
  readonly usage: number | null;
  readonly quota: number | null;
  readonly persisted: boolean;
}

export async function inspectStorageCapacity(): Promise<StorageCapacity> {
  if (!("storage" in navigator)) return { usage: null, quota: null, persisted: false };
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted(),
  ]);
  return {
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
    persisted,
  };
}

export async function requestPersistentStorageFromUserAction(): Promise<boolean> {
  if (!("storage" in navigator)) return false;
  return navigator.storage.persist();
}

