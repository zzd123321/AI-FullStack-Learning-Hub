import type { EmitFn, HTMLAttributes, PublicProps } from 'vue';
import type { DsTabChangeDetail, DsTabsElement } from './ds-tabs.js';

type EventMap = Readonly<Record<string, Event>>;
type VueEmit<Events extends EventMap> = EmitFn<{
  [Name in keyof Events]: (event: Events[Name]) => void;
}>;

type DefineCustomElement<
  ElementType extends HTMLElement,
  Events extends EventMap,
  SelectedProperties extends keyof ElementType,
> = new () => ElementType & {
  /** @deprecated 仅供 Vue Template 类型检查，元素实例上不存在。 */
  $props: HTMLAttributes & Partial<Pick<ElementType, SelectedProperties>> & PublicProps;
  /** @deprecated 仅供 Vue Template 类型检查，元素实例上不存在。 */
  $emit: VueEmit<Events>;
};

declare module 'vue' {
  interface GlobalComponents {
    'ds-tabs': DefineCustomElement<
      DsTabsElement,
      { 'ds-change': CustomEvent<DsTabChangeDetail> },
      'items' | 'selectedId' | 'activation' | 'label'
    >;
  }
}

export {};
