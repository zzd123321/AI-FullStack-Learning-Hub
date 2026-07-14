import type { LessonService, LessonSummary } from "./types.js";

function isLesson(value: unknown): value is LessonSummary {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    (record.status === "draft" || record.status === "published")
  );
}

export function createHttpLessonService(apiBaseUrl: URL): LessonService {
  return {
    async list(signal) {
      const response = await fetch(new URL("v1/lessons", apiBaseUrl), {
        signal,
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Lesson request failed: ${response.status}`);

      const body: unknown = await response.json();
      if (!Array.isArray(body) || !body.every(isLesson)) {
        throw new Error("Lesson response does not match the contract");
      }
      return body;
    },
  };
}
