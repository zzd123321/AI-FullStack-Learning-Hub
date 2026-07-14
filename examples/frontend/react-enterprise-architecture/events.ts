export const LESSON_SELECTED_EVENT = "learning:lesson-selected";

export interface LessonSelectedDetailV1 {
  readonly version: 1;
  readonly lessonId: string;
  readonly source: "vue-shell" | "react-widget" | "custom-element";
}

export function isLessonSelectedDetail(value: unknown): value is LessonSelectedDetailV1 {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.lessonId === "string" &&
    (record.source === "vue-shell" ||
      record.source === "react-widget" ||
      record.source === "custom-element")
  );
}

export function dispatchLessonSelected(
  target: EventTarget,
  detail: LessonSelectedDetailV1,
): void {
  target.dispatchEvent(
    new CustomEvent<LessonSelectedDetailV1>(LESSON_SELECTED_EVENT, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}

export function listenForLessonSelection(
  target: EventTarget,
  listener: (detail: LessonSelectedDetailV1) => void,
): () => void {
  const handler: EventListener = (event) => {
    if (event instanceof CustomEvent && isLessonSelectedDetail(event.detail)) {
      listener(event.detail);
    }
  };
  target.addEventListener(LESSON_SELECTED_EVENT, handler);
  return () => target.removeEventListener(LESSON_SELECTED_EVENT, handler);
}
