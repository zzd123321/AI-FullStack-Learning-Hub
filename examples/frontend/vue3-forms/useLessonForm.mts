import {
  computed,
  onScopeDispose,
  onWatcherCleanup,
  reactive,
  ref,
  watch
} from 'vue'
import {
  cloneDraft,
  createOutcomeDraft,
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
  isSlugAvailable,
  type ServerFieldErrors
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

function applyCurrentServerErrors(
  errors: FormErrors,
  fieldErrors: ServerFieldErrors,
  submitted: LessonDraft,
  current: LessonDraft
): void {
  for (const [field, message] of Object.entries(fieldErrors)) {
    const name = field as keyof ServerFieldErrors
    // 服务端校验的是提交快照。字段已被继续编辑时，旧错误不再描述当前值。
    if (message && current[name] === submitted[name]) errors[name] = message
  }
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
  let latestSlugCheckId = 0
  let activeSubmitController: AbortController | null = null

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
      // 每次回调都先换“所有者”；即使本轮不发请求，上一轮也不能再提交结果。
      const checkId = ++latestSlugCheckId
      if (!isTouched) {
        checkingSlug.value = false
        return
      }
      // submit() 会用提交快照做最终检查，不再并行启动字段级查重。
      if (submitting.value) {
        checkingSlug.value = false
        return
      }

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
        if (checkId !== latestSlugCheckId) return
        if (!available) errors.slug = '该 Slug 已被占用'
      } catch (cause: unknown) {
        if (
          checkId === latestSlugCheckId &&
          !(cause instanceof DOMException && cause.name === 'AbortError')
        ) {
          errors.slug = '暂时无法检查 Slug，请稍后重试'
        }
      } finally {
        // 旧请求结束时不能关闭新请求的 pending。
        if (checkId === latestSlugCheckId) checkingSlug.value = false
      }
    }
  )

  function addOutcome(): void {
    model.outcomes.push(createOutcomeDraft())
    touched.outcomes = true
    delete errors.outcomes
  }

  function removeOutcome(id: string): void {
    const index = model.outcomes.findIndex((outcome) => outcome.id === id)
    if (index >= 0) model.outcomes.splice(index, 1)
    delete errors.outcomeById[id]
    touched.outcomes = true
    validateOutcomes()
  }

  function validateOutcomes(): void {
    const next = validateDraft(model)
    if (next.outcomes) errors.outcomes = next.outcomes
    else delete errors.outcomes
    errors.outcomeById = { ...next.outcomeById }
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

    // 提交使用快照。用户在请求期间继续编辑时，成功结果只更新这份快照的基线。
    const submissionDraft = cloneDraft(model)
    submitting.value = true
    const controller = new AbortController()
    activeSubmitController = controller

    try {
      if (!(await isSlugAvailable(submissionDraft.slug, controller.signal))) {
        errors.slug = '该 Slug 已被占用'
        return false
      }

      const created = await createLesson(
        toCreateLessonInput(submissionDraft),
        controller.signal
      )
      baseline.value = serializeDraft(submissionDraft)
      submittedLessonId.value = created.id
      return true
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return false
      } else if (cause instanceof FormSubmissionError) {
        applyCurrentServerErrors(
          errors,
          cause.fieldErrors,
          submissionDraft,
          model
        )
        submitError.value = cause.message
      } else {
        submitError.value = '网络异常，请确认连接后重试'
      }
      return false
    } finally {
      if (activeSubmitController === controller) {
        activeSubmitController = null
        submitting.value = false
      }
    }
  }

  function restore(draft: LessonDraft): void {
    latestSlugCheckId += 1
    checkingSlug.value = false
    Object.assign(model, cloneDraft(draft))
    Object.assign(touched, emptyTouched())
    replaceErrors(errors, { outcomeById: {} })
  }

  function reset(): void {
    // 重置意味着旧提交结果已经失去表单状态的所有权。
    activeSubmitController?.abort()
    activeSubmitController = null
    submitting.value = false
    const empty = createEmptyDraft()
    restore(empty)
    baseline.value = serializeDraft(empty)
    submitError.value = null
    submittedLessonId.value = null
  }

  onScopeDispose(() => activeSubmitController?.abort())

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
    validateOutcomes,
    submit,
    restore,
    reset
  }
}
