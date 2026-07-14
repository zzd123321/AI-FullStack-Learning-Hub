import { emitLessonOpen } from "./custom-events.js";

export class LessonCardElement extends HTMLElement {
  #controller: AbortController | null = null;

  connectedCallback() {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<button type="button"><slot></slot></button>`;
    }
    this.#controller?.abort();
    this.#controller = new AbortController();
    this.shadowRoot?.querySelector("button")?.addEventListener("click", () => {
      const lessonId = this.getAttribute("lesson-id");
      if (!lessonId) return;
      const accepted = emitLessonOpen(this, { version: 1, lessonId, source: "card" });
      this.toggleAttribute("data-open-accepted", accepted);
    }, { signal: this.#controller.signal });
  }

  disconnectedCallback() {
    this.#controller?.abort();
    this.#controller = null;
  }
}

export function registerLessonCard(): void {
  if (!customElements.get("lesson-card")) customElements.define("lesson-card", LessonCardElement);
}
