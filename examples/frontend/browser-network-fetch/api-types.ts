export interface LessonSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

function isLessonSummary(value: unknown): value is LessonSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.updatedAt === "string" &&
    !Number.isNaN(Date.parse(record.updatedAt))
  );
}

export function parseLessonList(value: unknown): readonly LessonSummary[] {
  if (!Array.isArray(value) || !value.every(isLessonSummary)) {
    throw new TypeError("Lesson response does not match the expected schema");
  }
  return value;
}
