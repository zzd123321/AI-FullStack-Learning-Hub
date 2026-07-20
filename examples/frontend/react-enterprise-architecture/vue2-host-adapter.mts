import Vue from "vue";
import { mountReactWidget, type ReactWidgetHandle } from "./mount-react-widget.js";
import type { AppDependencies } from "./AppProviders.js";

export default Vue.extend({
  name: "ReactLessonWidget",
  props: {
    dependencies: {
      type: Object as () => AppDependencies,
      required: true,
    },
  },
  data(): { handle: ReactWidgetHandle | null } {
    return { handle: null };
  },
  mounted() {
    // mounted 之后 $refs.host 才对应真实 DOM；此时把容器所有权交给 React。
    this.handle = mountReactWidget(this.$refs.host as Element, this.dependencies);
  },
  watch: {
    dependencies: {
      deep: false,
      handler(next: AppDependencies) {
        // 依赖对象变化只更新现有 Root，避免丢失 React 子树中的本地状态。
        this.handle?.update(next);
      },
    },
  },
  beforeDestroy() {
    // Vue 2 使用 beforeDestroy；必须在宿主移除 DOM 之前对称卸载 React Root。
    this.handle?.unmount();
    this.handle = null;
  },
  render(createElement) {
    return createElement("div", {
      ref: "host",
      attrs: { "data-react-boundary": "lesson-widget" },
    });
  },
});
