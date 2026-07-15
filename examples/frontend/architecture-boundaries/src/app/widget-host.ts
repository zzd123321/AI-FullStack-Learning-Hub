import type { IntegrationEvent } from '../shared/integration-event.js';

export interface WidgetContext {
  readonly signal: AbortSignal;
  readonly publish: (event: IntegrationEvent) => void;
}

export interface WidgetHandle<Props> {
  update(next: Props): void;
  unmount(): void;
}

export interface WidgetModule<Props> {
  readonly contractVersion: 1;
  mount(container: HTMLElement, props: Props, context: WidgetContext): WidgetHandle<Props>;
}

const owners = new WeakSet<HTMLElement>();

export function mountOwnedWidget<Props>(
  container: HTMLElement,
  module: WidgetModule<Props>,
  initialProps: Props,
  publish: WidgetContext['publish'],
): WidgetHandle<Props> {
  if (owners.has(container)) throw new Error('Widget container already has an owner');
  if (module.contractVersion !== 1) throw new Error('Unsupported widget contract version');

  owners.add(container);
  const controller = new AbortController();
  let mounted: WidgetHandle<Props>;
  try {
    mounted = module.mount(container, initialProps, {
      signal: controller.signal,
      publish,
    });
  } catch (error) {
    controller.abort();
    owners.delete(container);
    throw error;
  }

  let disposed = false;
  return {
    update(next) {
      if (disposed) throw new Error('Cannot update an unmounted widget');
      mounted.update(next);
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      try {
        mounted.unmount();
      } finally {
        controller.abort();
        owners.delete(container);
        container.replaceChildren();
      }
    },
  };
}
