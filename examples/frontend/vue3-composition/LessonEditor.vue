<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  useTemplateRef,
  watch
} from 'vue'

interface Lesson {
  readonly id: string
  title: string
  durationMinutes: number
  published: boolean
}

interface LessonDraft {
  title: string
  durationMinutes: number
  published: boolean
}

interface Props {
  lesson: Lesson
  readonly?: boolean
  autosaveDelay?: number
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  autosaveDelay: 800
})

const emit = defineEmits<{
  save: [lesson: LessonDraft]
  cancel: []
  invalid: [errors: readonly string[]]
}>()

defineSlots<{
  header(props: {
    lessonId: string
    dirty: boolean
  }): unknown
  actions(props: {
    save(): Promise<void>
    saving: boolean
    valid: boolean
  }): unknown
}>()

const titleModel = defineModel<string>('title', {
  required: true
})

const titleInput = useTemplateRef<HTMLInputElement>('titleInput')
const saving = ref(false)
const lastSavedAt = ref<Date | null>(null)

const form: LessonDraft = reactive({
  title: props.lesson.title,
  durationMinutes: props.lesson.durationMinutes,
  published: props.lesson.published
})

const errors = computed<readonly string[]>(() => {
  const result: string[] = []

  if (!form.title.trim()) {
    result.push('标题不能为空')
  }

  if (form.durationMinutes <= 0) {
    result.push('课程时长必须大于 0')
  }

  return result
})

const valid = computed(() => errors.value.length === 0)

const dirty = computed(() =>
  form.title !== props.lesson.title ||
  form.durationMinutes !== props.lesson.durationMinutes ||
  form.published !== props.lesson.published
)

watch(
  () => props.lesson,
  lesson => {
    Object.assign(form, {
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      published: lesson.published
    })
  }
)

watch(
  () => form.title,
  title => {
    titleModel.value = title
  }
)

let autosaveTimer: ReturnType<typeof setTimeout> | undefined

function clearAutosave(): void {
  if (autosaveTimer !== undefined) {
    clearTimeout(autosaveTimer)
    autosaveTimer = undefined
  }
}

async function save(): Promise<void> {
  clearAutosave()

  if (!valid.value) {
    emit('invalid', errors.value)
    return
  }

  saving.value = true

  try {
    emit('save', { ...form })
    lastSavedAt.value = new Date()
  } finally {
    saving.value = false
  }
}

watch(
  [
    () => form.title,
    () => form.durationMinutes,
    () => form.published
  ],
  () => {
    clearAutosave()

    if (props.readonly || !dirty.value || !valid.value) {
      return
    }

    autosaveTimer = setTimeout(() => {
      void save()
    }, props.autosaveDelay)
  }
)

function focusTitle(): void {
  titleInput.value?.focus()
}

defineExpose({ focusTitle })

onBeforeUnmount(clearAutosave)
</script>

<template>
  <section class="lesson-editor">
    <slot
      name="header"
      :lesson-id="lesson.id"
      :dirty="dirty"
    >
      <h2>编辑课程</h2>
    </slot>

    <label>
      标题
      <input
        ref="titleInput"
        v-model.trim="form.title"
        :disabled="readonly"
      />
    </label>

    <label>
      时长（分钟）
      <input
        v-model.number="form.durationMinutes"
        type="number"
        min="1"
        :disabled="readonly"
      />
    </label>

    <label>
      <input
        v-model="form.published"
        type="checkbox"
        :disabled="readonly"
      />
      已发布
    </label>

    <ul v-if="errors.length" aria-live="polite">
      <li v-for="error in errors" :key="error">
        {{ error }}
      </li>
    </ul>

    <p v-if="lastSavedAt">
      最近保存：{{ lastSavedAt.toLocaleTimeString() }}
    </p>

    <slot
      name="actions"
      :save="save"
      :saving="saving"
      :valid="valid"
    >
      <button
        type="button"
        :disabled="readonly || saving || !dirty"
        @click="save"
      >
        {{ saving ? '保存中…' : '保存' }}
      </button>
      <button type="button" @click="emit('cancel')">
        取消
      </button>
    </slot>
  </section>
</template>

<style scoped>
.lesson-editor {
  display: grid;
  gap: 1rem;
  max-width: 36rem;
}

label {
  display: grid;
  gap: 0.35rem;
}
</style>
