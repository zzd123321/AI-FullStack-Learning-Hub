export {}

interface LessonEntity {
  readonly id: string
  title: string
  summary: string | null
  durationMinutes: number
  published: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

type CreateLessonInput = Pick<
  LessonEntity,
  'title' | 'summary' | 'durationMinutes'
>

type UpdateLessonInput = Partial<Pick<
  LessonEntity,
  'title' | 'summary' | 'durationMinutes' | 'published'
>>

type FieldErrors<Type> = Partial<{
  [Key in keyof Type]: string
}>

type FieldTouched<Type> = {
  [Key in keyof Type]: boolean
}

type FieldConfig<Type> = {
  [Key in keyof Type]-?: {
    label: string
    format(value: Type[Key]): string
  }
}

type Mutable<Type> = {
  -readonly [Key in keyof Type]: Type[Key]
}

type LessonEvent =
  | {
      type: 'lesson.created'
      payload: { id: string; title: string }
    }
  | {
      type: 'lesson.published'
      payload: { id: string; publishedAt: Date }
    }

type EventHandlers<
  Event extends { type: PropertyKey }
> = {
  [Current in Event as Current['type']]:
    (event: Current) => void
}

const createInput: CreateLessonInput = {
  title: 'TypeScript 映射类型与常用工具类型',
  summary: '从现有模型派生安全、可维护的对象类型',
  durationMinutes: 150
}

const initialLesson: LessonEntity = {
  id: 'ts-07',
  ...createInput,
  published: false,
  createdAt: new Date('2026-07-13T00:00:00Z'),
  updatedAt: new Date('2026-07-13T00:00:00Z')
}

function applyLessonPatch(
  lesson: LessonEntity,
  patch: UpdateLessonInput
): LessonEntity {
  return {
    ...lesson,
    ...patch,
    updatedAt: new Date()
  }
}

type LessonFormValue = Pick<
  LessonEntity,
  'title' | 'summary' | 'durationMinutes' | 'published'
>

const touched: FieldTouched<LessonFormValue> = {
  title: true,
  summary: false,
  durationMinutes: true,
  published: false
}

const errors: FieldErrors<LessonFormValue> = {
  durationMinutes: '课程时长必须大于 0'
}

const fieldConfig: FieldConfig<LessonFormValue> = {
  title: {
    label: '标题',
    format: value => value
  },
  summary: {
    label: '摘要',
    format: value => value ?? '暂无摘要'
  },
  durationMinutes: {
    label: '时长',
    format: value => `${value} 分钟`
  },
  published: {
    label: '发布状态',
    format: value => value ? '已发布' : '草稿'
  }
}

const handlers: EventHandlers<LessonEvent> = {
  'lesson.created': event => {
    console.log(`创建课程：${event.payload.title}`)
  },
  'lesson.published': event => {
    console.log(
      `发布课程：${event.payload.id}，${event.payload.publishedAt.toISOString()}`
    )
  }
}

const editableLesson: Mutable<LessonEntity> = {
  ...initialLesson
}

editableLesson.title = '映射类型与工具类型（更新）'

const updatedLesson = applyLessonPatch(editableLesson, {
  title: editableLesson.title,
  published: true
})

handlers['lesson.created']({
  type: 'lesson.created',
  payload: {
    id: updatedLesson.id,
    title: updatedLesson.title
  }
})

handlers['lesson.published']({
  type: 'lesson.published',
  payload: {
    id: updatedLesson.id,
    publishedAt: updatedLesson.updatedAt
  }
})

for (const key of Object.keys(fieldConfig) as Array<keyof LessonFormValue>) {
  console.log(`${fieldConfig[key].label}，已触碰：${touched[key]}`)
}

console.log('字段错误：', errors)
