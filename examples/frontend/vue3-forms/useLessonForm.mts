import { computed, reactive, ref, watch, onWatcherCleanup } from 'vue'
import {
  cloneDraft,
  createEmptyDraft,
  serializeDraft,
  toCreateLessonInput,
  type FormErrors,
  type LessonDraft,
  type ScalarFieldName,
  type TouchedState
} from './form-model.js'
import { hasErrors, validateDraft, validateScalarField } from './validators.js'
import {
  createLesson,
  FormSubmissionError,
  isSlugAvailable
} from './lesson-service.js'

function emptyTouched(): TouchedState {
  return {
    title: false,
    slug: false,
    summary: false,
    level: false,
    estimatedHours: false,
    outcomes: false
  }
}

function replaceErrors(target: FormErrors, source: FormErrors): void {
  delete target.title
  delete target.slug
  delete target.summary
  delete target.level
  delete target.estimatedHours
  delete target.outcomes
  target.outcomeById = { ...source.outcomeById }
  Object.assign(target, source)
}

export function useLessonForm() {
  const initial = createEmptyDraft()
  const model = reactive<LessonDraft>(cloneDraft(initial))
  const baseline = ref(serializeDraft(initial))
  const touched = reactive<TouchedState>(emptyTouched())
  const errors = reactive<FormErrors>({ outcomeById: {} })
  const checkingSlug = ref(false)
  const submitting = ref(false)
  const submitError = ref<string | null>(null)
  const submittedLessonId = ref<string | null>(null)

  const dirty = computed(() => serializeDraft(model) !== baseline.value)
  const valid = computed(() => !hasErrors(validateDraft(model)))

  function touch(field: keyof LessonDraft): void {
    touched[field] = true
  }

  function validateField(field: ScalarFieldName): void {
    const message = validateScalarField(field, model[field])
    if (message) errors[field] = message
    else delete errors[field]
  }

  watch(
    [() => model.slug, () => touched.slug],
    async ([slug, isTouched]) => {
      if (!isTouched) return

      validateField('slug')
      if (errors.slug) {
        checkingSlug.value = false
        return
      }

      const controller = new AbortController()
      onWatcherCleanup(() => controller.abort())
      checkingSlug.value = true

      try {
        const available = await isSlugAvailable(slug, controller.signal)
        if (!available) errors.slug = '该 Slug 已被占用'
      } catch (cause: unknown) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          errors.slug = '暂时无法检查 Slug，请稍后重试'
        }
      } finally {
        if (!controller.signal.aborted) checkingSlug.value = false
      }
    }
  )

  function addOutcome(): void {
    const id = `outcome-${Date.now()}-${model.outcomes.length}`
    model.outcomes.push({ id, text: '' })
    touched.outcomes = true
  }

  function removeOutcome(id: string): void {
    const index = model.outcomes.findIndex((outcome) => outcome.id === id)
    if (index >= 0) model.outcomes.splice(index, 1)
    delete errors.outcomeById[id]
    touched.outcomes = true
  }

  function validateAll(): boolean {
    Object.assign(touched, {
      title: true,
      slug: true,
      summary: true,
      level: true,
      estimatedHours: true,
      outcomes: true
    })
    const nextErrors = validateDraft(model)
    replaceErrors(errors, nextErrors)
    return !hasErrors(nextErrors)
  }

  async function submit(): Promise<boolean> {
    submitError.value = null
    submittedLessonId.value = null
    if (!validateAll() || submitting.value) return false

    submitting.value = true
    const controller = new AbortController()

    try {
      if (!(await isSlugAvailable(model.slug, controller.signal))) {
        errors.slug = '该 Slug 已被占用'
        return false
      }

      const created = await createLesson(toCreateLessonInput(model), controller.signal)
      baseline.value = serializeDraft(model)
      submittedLessonId.value = created.id
      return true
    } catch (cause: unknown) {
      if (cause instanceof FormSubmissionError) {
        Object.assign(errors, cause.fieldErrors)
        submitError.value = cause.message
      } else {
        submitError.value = '网络异常，请确认连接后重试'
      }
      return false
    } finally {
      submitting.value = false
    }
  }

  function restore(draft: LessonDraft): void {
    Object.assign(model, cloneDraft(draft))
    Object.assign(touched, emptyTouched())
    replaceErrors(errors, { outcomeById: {} })
  }

  function reset(): void {
    const empty = createEmptyDraft()
    restore(empty)
    baseline.value = serializeDraft(empty)
    submitError.value = null
    submittedLessonId.value = null
  }

  return {
    model,
    touched,
    errors,
    dirty,
    valid,
    checkingSlug,
    submitting,
    submitError,
    submittedLessonId,
    touch,
    validateField,
    addOutcome,
    removeOutcome,
    submit,
    restore,
    reset
  }
}
