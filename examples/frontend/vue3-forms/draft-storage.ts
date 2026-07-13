import {
  cloneDraft,
  createEmptyDraft,
  type LessonDraft,
  type LessonLevel
} from './form-model.js'

interface StoredDraftV1 {
  version: 1
  savedAt: string
  draft: LessonDraft
}

const storageKey = 'ai-learning:lesson-draft'
const levels = new Set<LessonLevel>(['beginner', 'intermediate', 'advanced'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseDraft(value: unknown): LessonDraft | null {
  if (!isRecord(value)) return null
  if (
    typeof value.title !== 'string' ||
    typeof value.slug !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.estimatedHours !== 'string' ||
    typeof value.level !== 'string' ||
    !levels.has(value.level as LessonLevel) ||
    !Array.isArray(value.outcomes)
  ) {
    return null
  }

  const outcomes = value.outcomes.flatMap((outcome) => {
    if (!isRecord(outcome)) return []
    if (typeof outcome.id !== 'string' || typeof outcome.text !== 'string') return []
    return [{ id: outcome.id, text: outcome.text }]
  })

  return {
    title: value.title,
    slug: value.slug,
    summary: value.summary,
    estimatedHours: value.estimatedHours,
    level: value.level as LessonLevel,
    outcomes: outcomes.length > 0 ? outcomes : createEmptyDraft().outcomes
  }
}

export function loadDraft(storage: Storage): LessonDraft | null {
  const raw = storage.getItem(storageKey)
  if (!raw) return null

  try {
    const stored: unknown = JSON.parse(raw)
    if (!isRecord(stored) || stored.version !== 1) return null
    return parseDraft(stored.draft)
  } catch {
    return null
  }
}

export function saveDraft(storage: Storage, draft: LessonDraft): void {
  const value: StoredDraftV1 = {
    version: 1,
    savedAt: new Date().toISOString(),
    draft: cloneDraft(draft)
  }
  storage.setItem(storageKey, JSON.stringify(value))
}

export function removeDraft(storage: Storage): void {
  storage.removeItem(storageKey)
}
