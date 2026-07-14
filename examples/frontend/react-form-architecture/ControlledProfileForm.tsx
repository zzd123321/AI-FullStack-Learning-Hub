import { useState } from 'react'

interface ProfileDraft {
  displayName: string
  bio: string
  newsletter: boolean
}

const initialDraft: ProfileDraft = { displayName: '', bio: '', newsletter: false }

export function ControlledProfileForm() {
  const [draft, setDraft] = useState(initialDraft)
  const [submitted, setSubmitted] = useState<ProfileDraft | null>(null)

  function update<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(draft)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        显示名称
        <input
          name="displayName"
          value={draft.displayName}
          onChange={(event) => update('displayName', event.target.value)}
        />
      </label>
      <label>
        简介
        <textarea
          name="bio"
          value={draft.bio}
          onChange={(event) => update('bio', event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="newsletter"
          checked={draft.newsletter}
          onChange={(event) => update('newsletter', event.target.checked)}
        />
        订阅更新
      </label>
      <button type="submit">预览</button>
      {submitted && <pre>{JSON.stringify(submitted, null, 2)}</pre>}
    </form>
  )
}
