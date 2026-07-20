export type CapabilityResult<T> =
  | { readonly kind: 'success'; readonly value: T }
  | { readonly kind: 'blocked'; readonly reason: 'permission-policy-or-activation' }
  | { readonly kind: 'unavailable'; readonly reason: 'unsupported' | 'insecure-context' }
  | { readonly kind: 'failed'; readonly reason: 'timeout' | 'device-unavailable' | 'unknown' };

export function classifyPositionError(error: unknown): CapabilityResult<never> {
  if (typeof error !== 'object' || error === null || typeof (error as { code?: unknown }).code !== 'number') {
    return { kind: 'failed', reason: 'unknown' };
  }

  // PERMISSION_DENIED does not reveal whether the user, OS, browser policy,
  // Permissions Policy, or another guard made the decision.
  switch ((error as { code: number }).code) {
    case 1: return { kind: 'blocked', reason: 'permission-policy-or-activation' };
    case 2: return { kind: 'failed', reason: 'device-unavailable' };
    case 3: return { kind: 'failed', reason: 'timeout' };
    default: return { kind: 'failed', reason: 'unknown' };
  }
}

export async function requestCurrentPosition(): Promise<CapabilityResult<GeolocationPosition>> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { kind: 'unavailable', reason: 'unsupported' };
  }
  if (!globalThis.isSecureContext) {
    return { kind: 'unavailable', reason: 'insecure-context' };
  }

  try {
    const value = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        // City/course discovery rarely needs GPS-level precision. Reusing a
        // recent position also reduces latency, device access, and energy use.
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000,
      });
    });
    // “success” means this operation produced a value. It does not promise a
    // persistent permission grant or a future successful call.
    return { kind: 'success', value };
  } catch (error) {
    return classifyPositionError(error);
  }
}

export async function copyTextFromUserGesture(text: string): Promise<CapabilityResult<void>> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return { kind: 'unavailable', reason: 'unsupported' };
  }
  if (!globalThis.isSecureContext) {
    return { kind: 'unavailable', reason: 'insecure-context' };
  }

  try {
    await navigator.clipboard.writeText(text);
    return { kind: 'success', value: undefined };
  } catch (error) {
    // NotAllowedError can cover permission, transient activation, focus, or
    // embedding policy. Do not tell the user “you denied it” without evidence.
    return error instanceof DOMException && error.name === 'NotAllowedError'
      ? { kind: 'blocked', reason: 'permission-policy-or-activation' }
      : { kind: 'failed', reason: 'unknown' };
  }
}
