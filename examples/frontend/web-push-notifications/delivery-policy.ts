import type { PushPayload } from './push-payload.js';

export interface NotificationPreferences {
  readonly enabledCategories: ReadonlySet<PushPayload['category']>;
  readonly quietHours: { readonly startHour: number; readonly endHour: number } | null;
}

export type DeliveryDecision =
  | { readonly send: true }
  | { readonly send: false; readonly reason: 'category-disabled' | 'quiet-hours' };

function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function decideDelivery(
  category: PushPayload['category'],
  localHour: number,
  preferences: NotificationPreferences,
): DeliveryDecision {
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) {
    throw new RangeError('Invalid local hour');
  }
  if (!preferences.enabledCategories.has(category)) {
    return { send: false, reason: 'category-disabled' };
  }
  const quiet = preferences.quietHours;
  if (quiet && isQuietHour(localHour, quiet.startHour, quiet.endHour)) {
    return { send: false, reason: 'quiet-hours' };
  }
  return { send: true };
}
