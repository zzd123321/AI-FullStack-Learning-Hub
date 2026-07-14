import { filterInChunks } from "./chunked-work.js";
import { runEventOrderDemo } from "./event-order.js";
import { createFrameLoop } from "./frame-loop.js";
import { startPerformanceMonitor } from "./performance-monitor.js";
import { findPrimesInWorker } from "./prime-client.js";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

const orderOutput = requireElement<HTMLOListElement>("#order-output");
requireElement<HTMLButtonElement>("#run-order").addEventListener("click", () => {
  orderOutput.replaceChildren();
  runEventOrderDemo((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    orderOutput.append(item);
  });
});

const progress = requireElement<HTMLProgressElement>("#chunk-progress");
const chunkOutput = requireElement<HTMLOutputElement>("#chunk-output");
requireElement<HTMLButtonElement>("#run-chunked").addEventListener("click", async () => {
  const values = Array.from({ length: 20_000 }, (_, index) => index + 1);
  const result = await filterInChunks(values, (value) => value % 3 === 0, {
    budgetMs: 8,
    onProgress: (completed) => {
      progress.value = completed;
    },
  });
  chunkOutput.value = `找到 ${result.length} 个 3 的倍数`;
});

let workerController: AbortController | null = null;
const workerOutput = requireElement<HTMLOutputElement>("#worker-output");
requireElement<HTMLButtonElement>("#run-worker").addEventListener("click", async () => {
  workerController?.abort();
  workerController = new AbortController();
  workerOutput.value = "计算中……";
  try {
    const result = await findPrimesInWorker(500_000, workerController.signal);
    workerOutput.value = `共 ${result.count} 个，最大值 ${result.largest ?? "无"}`;
  } catch (error) {
    workerOutput.value = error instanceof DOMException && error.name === "AbortError" ? "已取消" : "计算失败";
  }
});
requireElement<HTMLButtonElement>("#cancel-worker").addEventListener("click", () => {
  workerController?.abort();
});

const dot = requireElement<HTMLElement>("#dot");
const track = requireElement<HTMLElement>(".track");
let positionPx = 0;
const animation = createFrameLoop((elapsedMs) => {
  const maximum = Math.max(1, track.clientWidth - dot.offsetWidth);
  positionPx = (positionPx + elapsedMs * 0.12) % maximum;
  dot.style.transform = `translateX(${positionPx}px)`;
});
requireElement<HTMLButtonElement>("#toggle-animation").addEventListener("click", () => {
  if (animation.running) animation.stop();
  else animation.start();
});

const performanceOutput = requireElement<HTMLUListElement>("#performance-output");
startPerformanceMonitor((record) => {
  const item = document.createElement("li");
  item.textContent = `${record.type}: ${record.name || "(anonymous)"} ${record.duration.toFixed(1)}ms`;
  performanceOutput.prepend(item);
  while (performanceOutput.children.length > 20) performanceOutput.lastElementChild?.remove();
});
