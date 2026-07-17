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
const maxDraftAgeMs = 7 * 24 * 60 * 60 * 1000
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

export function loadDraft(
  storage: Storage,
  now = Date.now()
): LessonDraft | null {
  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return null
    const stored: unknown = JSON.parse(raw)
    if (
      !isRecord(stored) ||
      stored.version !== 1 ||
      typeof stored.savedAt !== 'string'
    ) {
      return null
    }

    const savedAt = Date.parse(stored.savedAt)
    const age = now - savedAt
    if (!Number.isFinite(savedAt) || age < 0 || age > maxDraftAgeMs) return null
    return parseDraft(stored.draft)
  } catch {
    // 隐私模式、存储策略或损坏 JSON 都不应阻止表单打开。
    return null
  }
}

export function saveDraft(storage: Storage, draft: LessonDraft): boolean {
  const value: StoredDraftV1 = {
    version: 1,
    savedAt: new Date().toISOString(),
    draft: cloneDraft(draft)
  }
  try {
    storage.setItem(storageKey, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeDraft(storage: Storage): boolean {
  try {
    storage.removeItem(storageKey)
    return true
  } catch {
    return false
  }
}
