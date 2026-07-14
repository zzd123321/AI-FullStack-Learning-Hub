export const LESSON_OPEN_EVENT = "learning:lesson-open";

export interface LessonOpenDetail {
  readonly version: 1;
  readonly lessonId: string;
  readonly source: "card" | "list";
}

export function emitLessonOpen(target: EventTarget, detail: LessonOpenDetail): boolean {
  return target.dispatchEvent(new CustomEvent<LessonOpenDetail>(LESSON_OPEN_EVENT, {
    detail,
    bubbles: true,
    composed: true,
    cancelable: true,
  }));
}

export function isLessonOpenEvent(event: Event): event is CustomEvent<LessonOpenDetail> {
  if (!(event instanceof CustomEvent) || event.type !== LESSON_OPEN_EVENT) return false;
  const value: unknown = event.detail;
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && typeof record.lessonId === "string" &&
    (record.source === "card" || record.source === "list");
}
