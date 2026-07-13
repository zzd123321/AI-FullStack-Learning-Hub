<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type WatchStopHandle
} from 'vue'
import BaseField from './BaseField.vue'
import { loadDraft, removeDraft, saveDraft } from './draft-storage.js'
import { useLessonForm } from './useLessonForm'

const {
  model,
  touched,
  errors,
  dirty,
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
} = useLessonForm()

const errorSummary = ref<HTMLElement | null>(null)
const submitAttempted = ref(false)
let stopDraftWatch: WatchStopHandle | undefined

const errorEntries = computed(() => {
  const entries: Array<{ href: string; message: string }> = []
  const scalarFields = [
    ['title', 'lesson-title'],
    ['slug', 'lesson-slug'],
    ['summary', 'lesson-summary'],
    ['level', 'lesson-level'],
    ['estimatedHours', 'estimated-hours']
  ] as const

  for (const [field, id] of scalarFields) {
    const message = errors[field]
    if (message) entries.push({ href: `#${id}`, message })
  }

  if (errors.outcomes) {
    entries.push({ href: '#outcomes-group', message: errors.outcomes })
  }

  for (const outcome of model.outcomes) {
    const message = errors.outcomeById[outcome.id]
    if (message) entries.push({ href: `#outcome-${outcome.id}`, message })
  }

  return entries
})

onMounted(() => {
  const saved = loadDraft(window.localStorage)
  if (saved) restore(saved)

  stopDraftWatch = watch(
    model,
    (draft, _previous, onCleanup) => {
      const timer = window.setTimeout(() => {
        if (dirty.value) saveDraft(window.localStorage, draft)
        else removeDraft(window.localStorage)
      }, 500)
      onCleanup(() => window.clearTimeout(timer))
    },
    { deep: true }
  )
})

onBeforeUnmount(() => stopDraftWatch?.())

async function handleSubmit(): Promise<void> {
  submitAttempted.value = true
  const success = await submit()

  if (success) {
    submitAttempted.value = false
    removeDraft(window.localStorage)
    return
  }

  await nextTick()
  errorSummary.value?.focus()
}

function resetForm(): void {
  reset()
  submitAttempted.value = false
  removeDraft(window.localStorage)
}
</script>

<template>
  <form novalidate @submit.prevent="handleSubmit()">
    <header>
      <h1>创建课程</h1>
      <p v-if="dirty">存在尚未保存的修改</p>
    </header>

    <section
      v-if="submitAttempted && (submitError || errorEntries.length > 0)"
      ref="errorSummary"
      tabindex="-1"
      role="alert"
      aria-labelledby="error-summary-title"
      class="error-summary"
    >
      <h2 id="error-summary-title">提交前请检查表单</h2>
      <p v-if="submitError">{{ submitError }}</p>
      <ul>
        <li v-for="entry in errorEntries" :key="entry.href">
          <a :href="entry.href">{{ entry.message }}</a>
        </li>
      </ul>
    </section>

    <BaseField
      id="lesson-title"
      label="课程标题"
      :error="touched.title ? errors.title : undefined"
      required
    >
      <template #default="{ describedBy, invalid }">
        <input
          id="lesson-title"
          v-model="model.title"
          maxlength="80"
          required
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          @blur="touch('title'); validateField('title')"
        />
      </template>
    </BaseField>

    <BaseField
      id="lesson-slug"
      label="URL Slug"
      hint="仅使用小写字母、数字和连字符，例如 vue-form-design。"
      :error="touched.slug ? errors.slug : undefined"
      required
    >
      <template #default="{ describedBy, invalid }">
        <input
          id="lesson-slug"
          v-model.trim="model.slug"
          inputmode="url"
          autocomplete="off"
          required
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          @blur="touch('slug'); validateField('slug')"
        />
        <span v-if="checkingSlug" role="status">正在检查可用性…</span>
      </template>
    </BaseField>

    <BaseField
      id="lesson-summary"
      label="课程摘要"
      hint="20–300 个字符。"
      :error="touched.summary ? errors.summary : undefined"
      required
    >
      <template #default="{ describedBy, invalid }">
        <textarea
          id="lesson-summary"
          v-model="model.summary"
          rows="5"
          maxlength="300"
          required
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          @blur="touch('summary'); validateField('summary')"
        />
      </template>
    </BaseField>

    <BaseField
      id="lesson-level"
      label="难度"
      :error="touched.level ? errors.level : undefined"
      required
    >
      <template #default="{ describedBy, invalid }">
        <select
          id="lesson-level"
          v-model="model.level"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          @blur="touch('level')"
        >
          <option value="beginner">入门</option>
          <option value="intermediate">进阶</option>
          <option value="advanced">高级</option>
        </select>
      </template>
    </BaseField>

    <BaseField
      id="estimated-hours"
      label="预计学时"
      hint="允许小数，提交时转换为分钟。"
      :error="touched.estimatedHours ? errors.estimatedHours : undefined"
      required
    >
      <template #default="{ describedBy, invalid }">
        <input
          id="estimated-hours"
          v-model="model.estimatedHours"
          type="number"
          min="0.5"
          max="200"
          step="0.5"
          required
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          @blur="touch('estimatedHours'); validateField('estimatedHours')"
        />
      </template>
    </BaseField>

    <fieldset id="outcomes-group" tabindex="-1">
      <legend>学习成果</legend>
      <p id="outcomes-hint">使用完整句子描述学完后能够做到什么。</p>
      <p v-if="touched.outcomes && errors.outcomes" class="error">
        {{ errors.outcomes }}
      </p>

      <div v-for="(outcome, index) in model.outcomes" :key="outcome.id">
        <label :for="`outcome-${outcome.id}`">成果 {{ index + 1 }}</label>
        <input
          :id="`outcome-${outcome.id}`"
          v-model="outcome.text"
          maxlength="120"
          aria-describedby="outcomes-hint"
          :aria-invalid="Boolean(errors.outcomeById[outcome.id])"
          @blur="touch('outcomes')"
        />
        <p v-if="errors.outcomeById[outcome.id]" class="error">
          {{ errors.outcomeById[outcome.id] }}
        </p>
        <button
          type="button"
          :aria-label="`删除成果 ${index + 1}`"
          @click="removeOutcome(outcome.id)"
        >
          删除
        </button>
      </div>

      <button type="button" @click="addOutcome()">添加学习成果</button>
    </fieldset>

    <p v-if="submittedLessonId" role="status">
      保存成功，课程 ID：{{ submittedLessonId }}
    </p>

    <div class="actions">
      <button type="submit" :disabled="submitting || checkingSlug">
        {{ submitting ? '保存中…' : '保存课程' }}
      </button>
      <button type="button" :disabled="submitting" @click="resetForm()">
        重置
      </button>
    </div>
  </form>
</template>

<style scoped>
form {
  display: grid;
  gap: 1.25rem;
  max-width: 44rem;
  margin: 2rem auto;
  font-family: system-ui, sans-serif;
}

input,
textarea,
select {
  box-sizing: border-box;
  width: 100%;
  padding: 0.55rem;
}

[aria-invalid='true'] {
  border-color: #b42318;
}

.error,
.error-summary {
  color: #b42318;
}

.error-summary {
  border: 2px solid currentColor;
  padding: 1rem;
}

fieldset > div {
  margin-block: 1rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
}
</style>
