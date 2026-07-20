import { useOptimistic, useState } from 'react'
import { createTag } from './lesson-service'
import { SubmitButton } from './SubmitButton'
import type { OptimisticTag, Tag } from './types'

export function OptimisticTagManager({ initialTags }: { initialTags: Tag[] }) {
  const [tags, setTags] = useState(initialTags)
  const [tagName, setTagName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [optimisticTags, addOptimisticTag] = useOptimistic(
    tags,
    (current, optimistic: OptimisticTag) => [...current, optimistic],
  )

  async function addTagAction(formData: FormData) {
    const value = formData.get('tag')
    const name = typeof value === 'string' ? value.trim() : ''
    if (!name) return

    setError(null)
    addOptimisticTag({ id: `optimistic-${crypto.randomUUID()}`, name, pending: true })
    try {
      const created = await createTag(name)
      setTags((current) => [...current, created])
      setTagName('')
    } catch {
      setError(`“${name}”创建失败，已撤销临时结果。`)
    }
  }

  return (
    <section>
      <ul>
        {optimisticTags.map((tag) => (
          <li key={tag.id} aria-busy={tag.pending}>{tag.name}{tag.pending && '（保存中）'}</li>
        ))}
      </ul>
      <form action={addTagAction}>
        <label>
          新标签
          <input
            name="tag"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            required
          />
        </label>
        <SubmitButton idleLabel="添加" pendingLabel="添加中……" />
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
