export interface LessonSummary {
  readonly id: string;
  readonly title: string;
}

function isLessonSummary(value: unknown): value is LessonSummary {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string';
}

export async function loadLesson(id: string, signal?: AbortSignal): Promise<LessonSummary> {
  const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Lesson request failed: HTTP ${response.status}`);

  const value: unknown = await response.json();
  if (!isLessonSummary(value)) throw new TypeError('Invalid lesson response');
  return value;
}
