export const tokens = {
  colorTextDefault: 'var(--ds-color-text-default)',
  colorSurfaceCanvas: 'var(--ds-color-surface-canvas)',
  colorActionPrimaryBackground: 'var(--ds-color-action-primary-background)',
  colorActionPrimaryBackgroundHover: 'var(--ds-color-action-primary-background-hover)',
  colorActionPrimaryForeground: 'var(--ds-color-action-primary-foreground)',
  buttonPaddingInline: 'var(--ds-button-padding-inline)',
  buttonPaddingBlock: 'var(--ds-button-padding-block)',
  buttonRadius: 'var(--ds-button-radius)',
} as const;

export type TokenName = keyof typeof tokens;
