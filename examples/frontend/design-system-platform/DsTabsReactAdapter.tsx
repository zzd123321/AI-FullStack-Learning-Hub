import { useEffect, useRef } from 'react';
import type { DsTabChangeDetail, DsTabsElement } from './ds-tabs.js';
import type { ActivationMode, TabDefinition } from './tabs-state.js';

export interface DsTabsProps {
  readonly items: readonly TabDefinition[];
  readonly selectedId?: string;
  readonly activation?: ActivationMode;
  readonly label: string;
  readonly onChange?: (selectedId: string) => void;
}

export function DsTabs({
  items,
  selectedId = '',
  activation = 'automatic',
  label,
  onChange,
}: DsTabsProps) {
  const element = useRef<DsTabsElement>(null);

  useEffect(() => {
    if (element.current) element.current.items = items;
  }, [items]);

  useEffect(() => {
    const current = element.current;
    if (!current || !onChange) return;
    const listener = (event: Event) => {
      onChange((event as CustomEvent<DsTabChangeDetail>).detail.selectedId);
    };
    current.addEventListener('ds-change', listener);
    return () => current.removeEventListener('ds-change', listener);
  }, [onChange]);

  // 未传 selectedId 时让元素自行选择第一个可用项，不制造空字符串状态。
  return (
    <ds-tabs
      ref={element}
      selected-id={selectedId || undefined}
      activation={activation}
      label={label}
    />
  );
}
