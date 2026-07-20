interface CounterState {
  value: number;
}

interface HotData {
  state?: CounterState;
}

const hot = import.meta.hot;
const data = hot?.data as HotData | undefined;
// 普通冷启动从 0 开始；热更新则接住 dispose 保存的同一个状态对象。
export const state: CounterState = data?.state ?? { value: 0 };

const timer = window.setInterval(() => {
  state.value += 1;
}, 1_000);

if (hot) {
  // 当前模块愿意成为 HMR 边界，不再继续向 importer 冒泡。
  hot.accept();
  hot.dispose((nextData: HotData) => {
    // 新模块执行前先释放旧副作用，否则每次保存都会多出一个计时器。
    window.clearInterval(timer);
    nextData.state = state;
  });
}
