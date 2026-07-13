import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type NativeButtonProps = ComponentPropsWithoutRef<'button'>

export interface ButtonProps extends Omit<NativeButtonProps, 'children'> {
  children: ReactNode
  tone?: 'primary' | 'neutral'
}

export function Button({
  children,
  tone = 'neutral',
  type = 'button',
  className,
  ...nativeProps
}: ButtonProps) {
  const classes = ['button', `button--${tone}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button {...nativeProps} type={type} className={classes}>
      {children}
    </button>
  )
}
