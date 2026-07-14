import { useEffect, useState } from "react";
import { useAppDependencies } from "./AppProviders.js";
import { useLessonSelection } from "./useLessonSelection.js";
import type { LessonSummary } from "./types.js";

export function LessonFeature() {
  const { lessonService, telemetry } = useAppDependencies();
  const { snapshot, select } = useLessonSelection();
  const [lessons, setLessons] = useState<readonly LessonSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lessonService.list(controller.signal).then(
      (result) => setLessons(result),
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        telemetry.error(reason, { feature: "lesson-list" });
        setError("课程加载失败，请稍后重试");
      },
    );
    return () => controller.abort();
  }, [lessonService, telemetry]);

  if (error) return <p role="alert">{error}</p>;

  return (
    <section aria-labelledby="lesson-heading">
      <h2 id="lesson-heading">课程</h2>
      <ul>
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <button
              type="button"
              aria-pressed={snapshot.selectedId === lesson.id}
              onClick={() => {
                select(lesson.id);
                telemetry.event("lesson_selected", { lessonId: lesson.id });
              }}
            >
              {lesson.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
