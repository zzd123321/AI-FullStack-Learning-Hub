export type IntegrationEvent =
  | {
      readonly type: 'learning.course-selected.v1';
      readonly occurredAt: string;
      readonly payload: { readonly courseId: string };
    }
  | {
      readonly type: 'learning.enrollment-confirmed.v1';
      readonly occurredAt: string;
      readonly payload: { readonly courseId: string; readonly enrollmentId: string };
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function parseIntegrationEvent(value: unknown): IntegrationEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const event = value as Record<string, unknown>;
  if (typeof event.type !== 'string' || !isCanonicalTimestamp(event.occurredAt)) return undefined;
  if (typeof event.payload !== 'object' || event.payload === null) return undefined;

  const payload = event.payload as Record<string, unknown>;
  if (event.type === 'learning.course-selected.v1' && isNonEmptyString(payload.courseId)) {
    return {
      type: event.type,
      occurredAt: event.occurredAt,
      payload: { courseId: payload.courseId },
    };
  }

  if (
    event.type === 'learning.enrollment-confirmed.v1' &&
    isNonEmptyString(payload.courseId) &&
    isNonEmptyString(payload.enrollmentId)
  ) {
    return {
      type: event.type,
      occurredAt: event.occurredAt,
      payload: {
        courseId: payload.courseId,
        enrollmentId: payload.enrollmentId,
      },
    };
  }
  return undefined;
}
