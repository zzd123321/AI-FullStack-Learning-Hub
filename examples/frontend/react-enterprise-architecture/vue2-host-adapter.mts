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
    this.handle = mountReactWidget(this.$refs.host as Element, this.dependencies);
  },
  watch: {
    dependencies: {
      deep: false,
      handler(next: AppDependencies) {
        this.handle?.update(next);
      },
    },
  },
  beforeDestroy() {
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
