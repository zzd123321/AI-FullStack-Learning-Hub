<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import LessonEditor from './LessonEditor.vue'

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

const lesson = ref<Lesson>({
  id: 'vue3-01',
  title: 'Vue 3 Composition API 与组件类型设计',
  durationMinutes: 150,
  published: false
})

const editorTitle = ref(lesson.value.title)
const message = ref('')
const editor = useTemplateRef<{
  focusTitle(): void
}>('editor')

function handleSave(draft: LessonDraft): void {
  lesson.value = {
    ...lesson.value,
    ...draft
  }
  editorTitle.value = draft.title
  message.value = '课程已保存'
}

function handleInvalid(errors: readonly string[]): void {
  message.value = errors.join('；')
}
</script>

<template>
  <main>
    <LessonEditor
      ref="editor"
      v-model:title="editorTitle"
      :lesson="lesson"
      :autosave-delay="1200"
      @save="handleSave"
      @invalid="handleInvalid"
      @cancel="message = '已取消编辑'"
    >
      <template #header="{ lessonId, dirty }">
        <h1>
          {{ lessonId }}
          <small>{{ dirty ? '未保存' : '已同步' }}</small>
        </h1>
      </template>

      <template #actions="{ save, saving, valid }">
        <button
          type="button"
          :disabled="saving || !valid"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存课程' }}
        </button>
      </template>
    </LessonEditor>

    <button type="button" @click="editor?.focusTitle()">
      聚焦标题
    </button>

    <p aria-live="polite">{{ message }}</p>
  </main>
</template>
