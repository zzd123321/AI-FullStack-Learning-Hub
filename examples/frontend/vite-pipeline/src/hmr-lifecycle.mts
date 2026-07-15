interface CounterState {
  value: number;
}

interface HotData {
  state?: CounterState;
}

const hot = import.meta.hot;
const data = hot?.data as HotData | undefined;
export const state: CounterState = data?.state ?? { value: 0 };

const timer = window.setInterval(() => {
  state.value += 1;
}, 1_000);

if (hot) {
  hot.accept();
  hot.dispose((nextData: HotData) => {
    window.clearInterval(timer);
    nextData.state = state;
  });
}
