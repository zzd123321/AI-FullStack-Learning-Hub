export type ObservablePermission = 'geolocation' | 'camera' | 'microphone' | 'notifications';

export interface PermissionSnapshot {
  readonly name: ObservablePermission;
  readonly state: PermissionState | 'unsupported';
}

export async function observePermission(
  name: ObservablePermission,
  onChange: (snapshot: PermissionSnapshot) => void,
): Promise<() => void> {
  if (!('permissions' in navigator)) {
    onChange({ name, state: 'unsupported' });
    return () => {};
  }
  try {
    const status = await navigator.permissions.query({ name } as PermissionDescriptor);
    const publish = () => onChange({ name, state: status.state });
    publish();
    status.addEventListener('change', publish);
    return () => status.removeEventListener('change', publish);
  } catch {
    onChange({ name, state: 'unsupported' });
    return () => {};
  }
}
