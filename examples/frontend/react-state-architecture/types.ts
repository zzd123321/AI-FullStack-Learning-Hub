export type LessonStatus = 'draft' | 'published'

export interface Lesson {
  readonly id: string
  readonly title: string
  readonly status: LessonStatus
}

export type PublishState =
  | { status: 'idle' }
  | { status: 'publishing'; requestId: string }
  | { status: 'success' }
  | { status: 'error'; message: string }

export interface WorkspaceState {
  readonly lessons: readonly Lesson[]
  readonly selectedId: string | null
  readonly drafts: Readonly<Record<string, string>>
  readonly publishById: Readonly<Record<string, PublishState>>
}

export type WorkspaceAction =
  | { type: 'lessonSelected'; lessonId: string }
  | { type: 'draftChanged'; lessonId: string; title: string }
  | { type: 'draftDiscarded'; lessonId: string }
  | { type: 'publishStarted'; lessonId: string; requestId: string }
  | { type: 'publishSucceeded'; lesson: Lesson; requestId: string }
  | { type: 'publishFailed'; lessonId: string; requestId: string; message: string }
