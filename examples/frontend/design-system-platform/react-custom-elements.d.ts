import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { DsTabsElement } from './ds-tabs.js';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ds-tabs': DetailedHTMLProps<HTMLAttributes<DsTabsElement>, DsTabsElement> & {
        'selected-id'?: string;
        activation?: 'automatic' | 'manual';
        label?: string;
      };
    }
  }
}
