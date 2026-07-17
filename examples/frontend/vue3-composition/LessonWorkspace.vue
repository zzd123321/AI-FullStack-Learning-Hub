<script setup lang="ts">
import { ref } from 'vue'
import LessonEditor from './LessonEditor.vue'

interface Lesson {
  readonly id: string
  readonly title: string
  readonly durationMinutes: number
  readonly published: boolean
}

interface LessonDraft {
  title: string
  durationMinutes: number
  published: boolean
}

/**
 * 父组件拥有课程数据。
 * 使用 ref 是因为保存时会用一个新对象整体替换旧课程。
 */
const lesson = ref<Lesson>({
  id: 'vue3-01',
  title: 'Vue 3 Composition API',
  durationMinutes: 120,
  published: false
})

const message = ref('尚未修改')

/** 接收子组件提交的草稿，再由数据所有者决定怎样更新。 */
function handleSave(draft: LessonDraft): void {
  lesson.value = {
    ...lesson.value,
    ...draft
  }

  message.value = `已保存：${lesson.value.title}`
}
</script>

<template>
  <main>
    <h1>课程工作区</h1>

    <!-- Props 向下传入，save 事件向上传递用户意图。 -->
    <LessonEditor :lesson="lesson" @save="handleSave" />

    <p aria-live="polite">{{ message }}</p>

    <h2>父组件中的最新数据</h2>
    <pre>{{ lesson }}</pre>
  </main>
</template>
