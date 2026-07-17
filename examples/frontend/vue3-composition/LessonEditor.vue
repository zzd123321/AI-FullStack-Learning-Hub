<script setup lang="ts">
import { computed, reactive } from 'vue'

/** 父组件传入的课程。id 由服务端生成，编辑器不应修改它。 */
interface Lesson {
  readonly id: string
  readonly title: string
  readonly durationMinutes: number
  readonly published: boolean
}

/** 用户真正可以编辑并提交的字段。 */
interface LessonDraft {
  title: string
  durationMinutes: number
  published: boolean
}

/** Props 是父组件给编辑器的只读输入。 */
const props = defineProps<{
  lesson: Lesson
}>()

/**
 * 子组件不直接修改 props.lesson，而是通过 save 事件提交一份新草稿。
 * 具名元组让事件名和事件参数都能得到类型检查。
 */
const emit = defineEmits<{
  save: [draft: LessonDraft]
}>()

/**
 * 表单的三个字段经常一起读取和修改，因此放进一个 reactive 对象。
 * 这里只复制可编辑字段，避免意外修改父组件拥有的课程对象。
 */
const draft: LessonDraft = reactive({
  title: props.lesson.title,
  durationMinutes: props.lesson.durationMinutes,
  published: props.lesson.published
})

/** 错误信息完全由表单状态计算出来，不需要再维护一份可变状态。 */
const errors = computed(() => {
  const result: string[] = []

  if (draft.title.trim().length === 0) {
    result.push('课程标题不能为空')
  }

  if (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes <= 0) {
    result.push('课程时长必须大于 0')
  }

  return result
})

/** 是否修改过同样属于派生状态。 */
const dirty = computed(() =>
  draft.title !== props.lesson.title
  || draft.durationMinutes !== props.lesson.durationMinutes
  || draft.published !== props.lesson.published
)

function submit(): void {
  // 模板已经会禁用无效按钮，但函数本身仍要守住边界。
  if (errors.value.length > 0 || !dirty.value) return

  // 发送普通对象快照，避免父组件拿到编辑器内部的响应式 Proxy。
  emit('save', {
    title: draft.title.trim(),
    durationMinutes: draft.durationMinutes,
    published: draft.published
  })
}
</script>

<template>
  <form class="lesson-editor" @submit.prevent="submit">
    <label>
      课程标题
      <input v-model="draft.title" />
    </label>

    <label>
      课程时长（分钟）
      <input
        v-model.number="draft.durationMinutes"
        type="number"
        min="1"
      />
    </label>

    <label class="checkbox-row">
      <input v-model="draft.published" type="checkbox" />
      立即发布
    </label>

    <!-- aria-live 让辅助技术在校验结果变化时读出信息。 -->
    <ul v-if="errors.length" class="errors" aria-live="polite">
      <li v-for="error in errors" :key="error">
        {{ error }}
      </li>
    </ul>

    <button
      type="submit"
      :disabled="errors.length > 0 || !dirty"
    >
      保存课程
    </button>
  </form>
</template>

<style scoped>
.lesson-editor {
  display: grid;
  gap: 1rem;
  max-width: 32rem;
}

label {
  display: grid;
  gap: 0.35rem;
}

.checkbox-row {
  display: flex;
  align-items: center;
}

.errors {
  color: #b42318;
}
</style>
