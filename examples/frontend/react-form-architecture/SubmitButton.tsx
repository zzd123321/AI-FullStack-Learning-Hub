import { useFormStatus } from 'react-dom'

export function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? '保存中……' : '保存课程'}
    </button>
  )
}
