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

  return (
    <ds-tabs
      ref={element}
      selected-id={selectedId}
      activation={activation}
      label={label}
    />
  );
}
