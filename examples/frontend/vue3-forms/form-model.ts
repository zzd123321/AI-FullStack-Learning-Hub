export type LessonLevel = 'beginner' | 'intermediate' | 'advanced'

export interface OutcomeDraft {
  id: string
  text: string
}

export interface LessonDraft {
  title: string
  slug: string
  summary: string
  level: LessonLevel
  estimatedHours: string
  outcomes: OutcomeDraft[]
}

export type ScalarFieldName = Exclude<keyof LessonDraft, 'outcomes'>
export type TouchedState = Record<keyof LessonDraft, boolean>

export interface FormErrors {
  title?: string
  slug?: string
  summary?: string
  level?: string
  estimatedHours?: string
  outcomes?: string
  outcomeById: Record<string, string>
}

export interface CreateLessonInput {
  title: string
  slug: string
  summary: string
  level: LessonLevel
  estimatedMinutes: number
  outcomes: string[]
}

let nextOutcomeId = 1

function createOutcomeId(): string {
  return `outcome-${nextOutcomeId++}`
}

export function createEmptyDraft(): LessonDraft {
  return {
    title: '',
    slug: '',
    summary: '',
    level: 'intermediate',
    estimatedHours: '',
    outcomes: [{ id: createOutcomeId(), text: '' }]
  }
}

export function cloneDraft(draft: LessonDraft): LessonDraft {
  return {
    ...draft,
    outcomes: draft.outcomes.map((outcome) => ({ ...outcome }))
  }
}

export function normalizeDraft(draft: LessonDraft): LessonDraft {
  return {
    title: draft.title.trim(),
    slug: draft.slug.trim().toLocaleLowerCase(),
    summary: draft.summary.trim(),
    level: draft.level,
    estimatedHours: draft.estimatedHours.trim(),
    outcomes: draft.outcomes.map((outcome) => ({
      id: outcome.id,
      text: outcome.text.trim()
    }))
  }
}

export function serializeDraft(draft: LessonDraft): string {
  return JSON.stringify(normalizeDraft(draft))
}

export function toCreateLessonInput(draft: LessonDraft): CreateLessonInput {
  const normalized = normalizeDraft(draft)

  return {
    title: normalized.title,
    slug: normalized.slug,
    summary: normalized.summary,
    level: normalized.level,
    estimatedMinutes: Math.round(Number(normalized.estimatedHours) * 60),
    outcomes: normalized.outcomes.map((outcome) => outcome.text)
  }
}
