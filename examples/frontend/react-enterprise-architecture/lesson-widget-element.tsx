import { createRoot, type Root } from "react-dom/client";
import { App } from "./App.js";
import { AppProviders, type AppDependencies } from "./AppProviders.js";

export class LessonWidgetElement extends HTMLElement {
  #root: Root | null = null;
  #dependencies: AppDependencies | null = null;
  #mountPoint = document.createElement("div");

  set dependencies(value: AppDependencies) {
    this.#dependencies = value;
    this.#render();
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: "open" });
      shadow.append(this.#mountPoint);
    }
    this.#render();
  }

  disconnectedCallback() {
    queueMicrotask(() => {
      if (this.isConnected) return; // DOM 移动不应误销毁根节点
      this.#root?.unmount();
      this.#root = null;
    });
  }

  #render() {
    if (!this.isConnected || !this.#dependencies) return;
    this.#root ??= createRoot(this.#mountPoint);
    this.#root.render(
      <AppProviders dependencies={this.#dependencies}>
        <App />
      </AppProviders>,
    );
  }
}

export function registerLessonWidgetElement(): void {
  if (!customElements.get("learning-lesson-widget")) {
    customElements.define("learning-lesson-widget", LessonWidgetElement);
  }
}
