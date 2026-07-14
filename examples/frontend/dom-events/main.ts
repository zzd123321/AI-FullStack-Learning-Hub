import { isLessonOpenEvent, LESSON_OPEN_EVENT } from "./custom-events.js";
import { delegate } from "./delegation.js";
import { registerLessonCard } from "./lesson-card-element.js";
import { createRovingToolbar } from "./roving-toolbar.js";

registerLessonCard();
const list = document.querySelector<HTMLElement>("#lessons");
const toolbar = document.querySelector<HTMLElement>("[role=toolbar]");
if (!list || !toolbar) throw new Error("Demo markup is incomplete");

delegate(list, "click", "button[data-remove]", (_event, button) => {
  button.closest("li")?.remove();
});
createRovingToolbar(toolbar);

document.addEventListener(LESSON_OPEN_EVENT, (event) => {
  if (!isLessonOpenEvent(event)) return;
  console.log("open lesson", event.detail.lessonId, event.composedPath());
});
