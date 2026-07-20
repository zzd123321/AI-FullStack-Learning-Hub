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

let tabsInstanceCount = 0;

export class DsTabsElement extends HTMLElement {
  static readonly observedAttributes = ['selected-id', 'activation', 'label'];
  readonly #root = this.attachShadow({ mode: 'open' });
  // 内部 ID 不拼接业务 id，避免空格等字符破坏 ARIA IDREF 关系。
  readonly #uid = `ds-tabs-${++tabsInstanceCount}`;
  #items: readonly TabDefinition[] = [];
  #state: TabsState | undefined;
  #reflectingSelection = false;

  get items(): readonly TabDefinition[] {
    return this.#items;
  }

  set items(value: readonly TabDefinition[]) {
    this.#items = [...value];
    this.#recreateState();
  }

  get selectedId(): string {
    return this.#state?.selectedId ?? this.getAttribute('selected-id') ?? '';
  }

  set selectedId(value: string) {
    // 即使 items 尚未到达也先保存意图；items setter 稍后会据此建状态。
    this.setAttribute('selected-id', value);
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
    if (!this.isConnected || (name === 'selected-id' && this.#reflectingSelection)) return;
    if (name === 'label') this.#render();
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
    this.#reflectSelectedId(this.#state.selectedId);
    this.#render();
  }

  #reflectSelectedId(selectedId: string): void {
    if (this.getAttribute('selected-id') === selectedId) return;
    this.#reflectingSelection = true;
    this.setAttribute('selected-id', selectedId);
    this.#reflectingSelection = false;
  }

  #commit(next: TabsState, notify: boolean, moveFocus: boolean): void {
    const changed = next.selectedId !== this.#state?.selectedId;
    this.#state = next;
    this.#reflectSelectedId(next.selectedId);
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

  #domId(kind: 'tab' | 'panel', index: number): string {
    return `${this.#uid}-${kind}-${index}`;
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

    state.items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.disabled = item.disabled ?? false;
      button.dataset.tabId = item.id;
      button.id = this.#domId('tab', index);
      button.setAttribute('role', 'tab');
      button.setAttribute('part', 'tab');
      button.setAttribute('aria-selected', String(item.id === state.selectedId));
      button.setAttribute('aria-controls', this.#domId('panel', index));
      button.tabIndex = item.id === state.focusedId ? 0 : -1;
      button.addEventListener('click', () => this.#commit(selectTab(state, item.id), true, true));
      list.append(button);
    });

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

    // 每个 tab 的 aria-controls 都应指向真实存在的 panel；未选中项用 hidden 隐藏。
    const panels = state.items.map((item, index) => {
      const panel = document.createElement('div');
      panel.id = this.#domId('panel', index);
      panel.textContent = item.panel;
      panel.hidden = item.id !== state.selectedId;
      panel.tabIndex = 0;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('part', 'tabpanel');
      panel.setAttribute('aria-labelledby', this.#domId('tab', index));
      return panel;
    });
    this.#root.replaceChildren(style, list, ...panels);
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
