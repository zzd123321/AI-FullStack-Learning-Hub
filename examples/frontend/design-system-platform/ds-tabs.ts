import {
  activateFocusedTab,
  createTabsState,
  focusTab,
  selectTab,
  type ActivationMode,
  type TabDefinition,
  type TabsState,
} from './tabs-state.js';

export interface DsTabChangeDetail {
  readonly selectedId: string;
}

export class DsTabsElement extends HTMLElement {
  static readonly observedAttributes = ['selected-id', 'activation', 'label', 'id'];
  readonly #root = this.attachShadow({ mode: 'open' });
  readonly #uid = `ds-tabs-${crypto.randomUUID()}`;
  #items: readonly TabDefinition[] = [];
  #state: TabsState | undefined;

  get items(): readonly TabDefinition[] {
    return this.#items;
  }

  set items(value: readonly TabDefinition[]) {
    this.#items = [...value];
    this.#recreateState();
  }

  get selectedId(): string {
    return this.#state?.selectedId ?? '';
  }

  set selectedId(value: string) {
    if (!this.#state) return;
    this.#commit(selectTab(this.#state, value), false, false);
  }

  get activation(): ActivationMode {
    return this.getAttribute('activation') === 'manual' ? 'manual' : 'automatic';
  }

  set activation(value: ActivationMode) {
    this.setAttribute('activation', value);
  }

  get label(): string {
    return this.getAttribute('label') ?? '内容分区';
  }

  set label(value: string) {
    this.setAttribute('label', value);
  }

  connectedCallback(): void {
    this.#recreateState();
  }

  attributeChangedCallback(name: string): void {
    if (!this.isConnected) return;
    if (name === 'label' || name === 'id') this.#render();
    else this.#recreateState();
  }

  #recreateState(): void {
    if (this.#items.length === 0) {
      this.#root.replaceChildren();
      this.#state = undefined;
      return;
    }
    this.#state = createTabsState(
      this.#items,
      this.getAttribute('selected-id') ?? this.#state?.selectedId,
      this.activation,
    );
    if (this.getAttribute('selected-id') !== this.#state.selectedId) {
      this.setAttribute('selected-id', this.#state.selectedId);
    }
    this.#render();
  }

  #commit(next: TabsState, notify: boolean, moveFocus: boolean): void {
    const changed = next.selectedId !== this.#state?.selectedId;
    this.#state = next;
    if (this.getAttribute('selected-id') !== next.selectedId) {
      this.setAttribute('selected-id', next.selectedId);
    }
    this.#render();
    if (moveFocus) this.#button(next.focusedId)?.focus();
    if (notify && changed) {
      this.dispatchEvent(
        new CustomEvent<DsTabChangeDetail>('ds-change', {
          bubbles: true,
          composed: true,
          detail: { selectedId: next.selectedId },
        }),
      );
    }
  }

  #button(id: string): HTMLButtonElement | null {
    return this.#root.querySelector(`[data-tab-id="${CSS.escape(id)}"]`);
  }

  #baseId(): string {
    return this.id || this.#uid;
  }

  #render(): void {
    const state = this.#state;
    if (!state) return;
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; color: var(--ds-color-text-default, #121727); }
      [role="tablist"] { display: flex; gap: 4px; border-bottom: 1px solid currentColor; }
      [role="tab"] { border: 0; border-radius: var(--ds-button-radius, 8px) var(--ds-button-radius, 8px) 0 0; padding: 8px 12px; background: transparent; color: inherit; }
      [role="tab"][aria-selected="true"] { background: var(--ds-color-action-primary-background, #2550c2); color: var(--ds-color-action-primary-foreground, #fff); }
      [role="tab"]:focus-visible { outline: 3px solid var(--ds-color-action-primary-background-hover, #1a3b9c); outline-offset: 2px; }
      [role="tab"]:disabled { opacity: .45; }
      [role="tabpanel"] { padding: 16px 0; }
    `;
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', this.label);
    list.setAttribute('part', 'tablist');

    for (const item of state.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.disabled = item.disabled ?? false;
      button.dataset.tabId = item.id;
      button.id = `${this.#baseId()}-tab-${item.id}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('part', 'tab');
      button.setAttribute('aria-selected', String(item.id === state.selectedId));
      button.setAttribute('aria-controls', `${this.#baseId()}-panel-${item.id}`);
      button.tabIndex = item.id === state.focusedId ? 0 : -1;
      button.addEventListener('click', () => this.#commit(selectTab(state, item.id), true, true));
      list.append(button);
    }

    list.addEventListener('keydown', (event) => {
      if (!this.#state) return;
      let next: TabsState | undefined;
      if (event.key === 'ArrowRight') next = focusTab(this.#state, 1);
      if (event.key === 'ArrowLeft') next = focusTab(this.#state, -1);
      if (event.key === 'Home') next = focusTab(this.#state, 'first');
      if (event.key === 'End') next = focusTab(this.#state, 'last');
      if ((event.key === 'Enter' || event.key === ' ') && this.activation === 'manual') {
        next = activateFocusedTab(this.#state);
      }
      if (!next) return;
      event.preventDefault();
      this.#commit(next, true, true);
    });

    const selected = state.items.find((item) => item.id === state.selectedId)!;
    const panel = document.createElement('div');
    panel.id = `${this.#baseId()}-panel-${selected.id}`;
    panel.textContent = selected.panel;
    panel.tabIndex = 0;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('part', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${this.#baseId()}-tab-${selected.id}`);
    this.#root.replaceChildren(style, list, panel);
  }
}

export function registerDesignSystemElements(): void {
  if (!customElements.get('ds-tabs')) customElements.define('ds-tabs', DsTabsElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'ds-tabs': DsTabsElement;
  }
}
