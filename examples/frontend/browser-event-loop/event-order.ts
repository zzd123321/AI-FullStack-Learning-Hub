export type Trace = (message: string) => void;

export function runEventOrderDemo(trace: Trace): void {
  trace("同步：脚本开始");

  setTimeout(() => trace("任务：setTimeout"), 0);

  queueMicrotask(() => {
    trace("微任务：queueMicrotask");
    queueMicrotask(() => trace("微任务：由微任务继续加入"));
  });

  Promise.resolve().then(() => trace("微任务：Promise.then"));

  requestAnimationFrame(() => {
    trace("渲染步骤：requestAnimationFrame 回调");
    queueMicrotask(() => trace("微任务：rAF 回调中加入"));
  });

  trace("同步：脚本结束");
}
