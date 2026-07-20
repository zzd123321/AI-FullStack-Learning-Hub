import { useFormStatus } from 'react-dom'

interface SubmitButtonProps {
  idleLabel?: string
  pendingLabel?: string
}

export function SubmitButton({
  idleLabel = '保存课程',
  pendingLabel = '保存中……',
}: SubmitButtonProps) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}
