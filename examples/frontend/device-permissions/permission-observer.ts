export type ObservablePermission = 'geolocation' | 'camera' | 'microphone' | 'notifications';

export type PermissionSnapshot =
  | { readonly name: ObservablePermission; readonly kind: 'state'; readonly state: PermissionState }
  | {
    readonly name: ObservablePermission;
    readonly kind: 'unavailable';
    readonly reason: 'api-unsupported' | 'descriptor-unsupported' | 'query-failed';
  };

export async function observePermission(
  name: ObservablePermission,
  onChange: (snapshot: PermissionSnapshot) => void,
  signal?: AbortSignal,
): Promise<() => void> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
    onChange({ name, kind: 'unavailable', reason: 'api-unsupported' });
    return () => {};
  }
  if (signal?.aborted) return () => {};

  let status: PermissionStatus;
  try {
    // lib.dom's PermissionName can lag browser implementations. The cast only
    // crosses the TypeScript declaration gap; rejection is still handled.
    status = await navigator.permissions.query({ name } as PermissionDescriptor);
  } catch (error) {
    if (!signal?.aborted) {
      onChange({
        name,
        kind: 'unavailable',
        reason: error instanceof TypeError ? 'descriptor-unsupported' : 'query-failed',
      });
    }
    return () => {};
  }

  if (signal?.aborted) return () => {};
  let active = true;
  const publish = () => {
    if (active) onChange({ name, kind: 'state', state: status.state });
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    status.removeEventListener('change', publish);
    signal?.removeEventListener('abort', cleanup);
  };

  status.addEventListener('change', publish);
  signal?.addEventListener('abort', cleanup, { once: true });
  // Consumer callback errors are application errors and intentionally escape;
  // they must not be mislabeled as an unsupported permission descriptor.
  try {
    publish();
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}
