import type { SelectionSnapshot } from "./types.js";

export interface SelectionStore {
  getSnapshot(): SelectionSnapshot;
  getServerSnapshot(): SelectionSnapshot;
  subscribe(listener: () => void): () => void;
  select(lessonId: string | null): void;
}

export function createSelectionStore(initialId: string | null): SelectionStore {
  const listeners = new Set<() => void>();
  // 服务端渲染与 Hydration 首次读取必须看到同一份初始快照。
  // 真正 SSR 时，应把服务端使用的 initialId 一并序列化给浏览器。
  const serverSnapshot = Object.freeze({ selectedId: initialId, revision: 0 });
  let snapshot: SelectionSnapshot = serverSnapshot;

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select(selectedId) {
      if (selectedId === snapshot.selectedId) return;
      // useSyncExternalStore 用 Object.is 比较快照：数据变化时创建新对象，
      // 没有变化时保留旧引用，不能在 getSnapshot 中临时构造对象。
      snapshot = Object.freeze({ selectedId, revision: snapshot.revision + 1 });
      // 先替换快照再同步通知，订阅者回读时才能获得新值。
      listeners.forEach((listener) => listener());
    },
  };
}
