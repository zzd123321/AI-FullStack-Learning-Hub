<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import LessonRow from './LessonRow.vue'
import {
  createLessons,
  filterLessons,
  renameLesson
} from './lesson-data.js'

// 数据量足够大时，深层 Proxy 访问也会产生可测成本。
// shallowRef 要求我们把记录视为不可变值，并在修改时替换根数组。
const lessons = shallowRef(createLessons(1_000))
const keyword = ref('')
const selectedId = ref<string | null>(null)

const visibleLessons = computed(() => filterLessons(lessons.value, keyword.value))

function select(lessonId: string): void {
  selectedId.value = lessonId
}

function renameSelected(): void {
  if (!selectedId.value) return

  lessons.value = renameLesson(
    lessons.value,
    selectedId.value,
    `已更新 ${new Date().toLocaleTimeString()}`
  )
}
</script>

<template>
  <section>
    <header>
      <h1>课程目录</h1>
      <label>
        筛选
        <input v-model="keyword" type="search" />
      </label>
      <button type="button" :disabled="!selectedId" @click="renameSelected()">
        重命名选中课程
      </button>
    </header>

    <p>显示 {{ visibleLessons.length }} / {{ lessons.length }} 条</p>

    <ul>
      <!-- 把 active 布尔值算好再传入；选择变化时只有新旧两行的值改变。 -->
      <LessonRow
        v-for="lesson in visibleLessons"
        :key="lesson.id"
        :lesson="lesson"
        :active="lesson.id === selectedId"
        @select="select"
      />
    </ul>
  </section>
</template>
