import { parseLessonList } from "./api-types.js";
import { fetchJson } from "./fetch-json.js";
import { observeResources } from "./resource-timing.js";
import { resolveApiUrl } from "./url-policy.js";

const output = document.querySelector<HTMLOutputElement>("#output");
const button = document.querySelector<HTMLButtonElement>("#load");
if (!output || !button) throw new Error("Demo UI is incomplete");

const apiBaseUrl = new URL("/api/", window.location.href);
const policy = {
  allowedOrigins: new Set([window.location.origin]),
  allowedProtocols: new Set(["https:", ...(window.location.hostname === "localhost" ? ["http:"] : [])]),
};

const stopObserving = observeResources((record) => {
  console.table(record);
});
window.addEventListener("pagehide", stopObserving, { once: true });

let controller: AbortController | null = null;
button.addEventListener("click", async () => {
  controller?.abort(new DOMException("Superseded by a newer request", "AbortError"));
  controller = new AbortController();
  output.value = "加载中……";

  try {
    const url = resolveApiUrl("v1/lessons", apiBaseUrl, policy);
    const lessons = await fetchJson(url, parseLessonList, {
      signal: controller.signal,
      timeoutMs: 8_000,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    output.value = `加载了 ${lessons.length} 门课程`;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    output.value = error instanceof DOMException && error.name === "TimeoutError" ? "请求超时" : "加载失败";
  }
});
