import { mountReactWidget } from "./mount-react-widget.js";
import { parseRuntimeConfig } from "./runtime-config.js";
import { createSelectionStore } from "./selection-store.js";
import { createHttpLessonService } from "./http-lesson-service.js";
import { createTelemetry } from "./telemetry.js";

const container = document.querySelector("#react-learning-root");
if (!container) throw new Error("React mount container is missing");

const config = parseRuntimeConfig(window.__LEARNING_CONFIG__, new Set([window.location.origin]));
const telemetry = createTelemetry(config.release, (envelope) => {
  navigator.sendBeacon("/telemetry", JSON.stringify(envelope));
});

mountReactWidget(container, {
  config,
  telemetry,
  lessonService: createHttpLessonService(config.apiBaseUrl),
  selectionStore: createSelectionStore(null),
  session: { userId: "u-42", tenantId: "tenant-cn", roles: ["learner"] },
});

declare global {
  interface Window {
    __LEARNING_CONFIG__: unknown;
  }
}
