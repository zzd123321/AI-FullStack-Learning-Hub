'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={disabled || pending}>
      {pending ? '报名中……' : '立即报名'}
    </button>
  )
}
