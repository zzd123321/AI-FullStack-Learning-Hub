export type CapabilityResult<T> =
  | { readonly kind: 'granted'; readonly value: T }
  | { readonly kind: 'denied'; readonly recoverable: boolean }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'failed'; readonly error: Error };

export async function requestCurrentPosition(): Promise<CapabilityResult<GeolocationPosition>> {
  if (!isSecureContext || !('geolocation' in navigator)) {
    return { kind: 'unavailable', reason: '定位需要安全上下文和浏览器支持' };
  }
  try {
    const value = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000,
      });
    });
    return { kind: 'granted', value };
  } catch (error) {
    if (typeof error === 'object' && error !== null
      && (error as { code?: unknown }).code === 1) return { kind: 'denied', recoverable: false };
    return { kind: 'failed', error: error instanceof Error ? error : new Error('定位失败') };
  }
}

export async function copyTextFromUserGesture(text: string): Promise<CapabilityResult<void>> {
  if (!isSecureContext || !navigator.clipboard) return { kind: 'unavailable', reason: '剪贴板不可用' };
  try {
    await navigator.clipboard.writeText(text);
    return { kind: 'granted', value: undefined };
  } catch (error) {
    return error instanceof DOMException && error.name === 'NotAllowedError'
      ? { kind: 'denied', recoverable: true }
      : { kind: 'failed', error: error instanceof Error ? error : new Error('复制失败') };
  }
}
