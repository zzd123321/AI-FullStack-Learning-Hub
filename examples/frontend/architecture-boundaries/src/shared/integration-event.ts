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

export function parseIntegrationEvent(value: unknown): IntegrationEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const event = value as Record<string, unknown>;
  if (typeof event.type !== 'string' || typeof event.occurredAt !== 'string') return undefined;
  if (Number.isNaN(Date.parse(event.occurredAt))) return undefined;
  if (typeof event.payload !== 'object' || event.payload === null) return undefined;

  const payload = event.payload as Record<string, unknown>;
  if (event.type === 'learning.course-selected.v1' && typeof payload.courseId === 'string') {
    return {
      type: event.type,
      occurredAt: event.occurredAt,
      payload: { courseId: payload.courseId },
    };
  }

  if (
    event.type === 'learning.enrollment-confirmed.v1' &&
    typeof payload.courseId === 'string' &&
    typeof payload.enrollmentId === 'string'
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
