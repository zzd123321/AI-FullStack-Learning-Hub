<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useLessonStore } from './lesson-store'

const lessonStore = useLessonStore()

const {
  items,
  keyword,
  status,
  loading,
  publishing,
  error,
  publishedCount,
  selectedLesson
} = storeToRefs(lessonStore)

const { load, select, publishSelected, $reset } = lessonStore

onMounted(() => {
  void load()
})

function resetAndReload(): void {
  $reset()
  void load()
}
</script>

<template>
  <main class="lesson-page">
    <header>
      <h1>课程管理</h1>
      <p>已发布 {{ publishedCount }} / {{ items.length }}</p>
    </header>

    <form class="filters" @submit.prevent="load()">
      <label>
        关键词
        <input v-model.trim="keyword" placeholder="搜索课程标题" />
      </label>

      <label>
        状态
        <select v-model="status">
          <option value="all">全部</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
        </select>
      </label>

      <button type="submit" :disabled="loading">
        {{ loading ? '加载中…' : '查询' }}
      </button>
      <button type="button" @click="resetAndReload">重置</button>
    </form>

    <p v-if="error" role="alert">{{ error }}</p>

    <div class="content">
      <ul aria-label="课程列表">
        <li v-for="lesson in items" :key="lesson.id">
          <button
            type="button"
            :aria-pressed="lesson.id === selectedLesson?.id"
            @click="select(lesson.id)"
          >
            {{ lesson.title }} · {{ lesson.status }}
          </button>
        </li>
      </ul>

      <section v-if="selectedLesson" aria-live="polite">
        <h2>{{ selectedLesson.title }}</h2>
        <dl>
          <dt>分类</dt>
          <dd>{{ selectedLesson.category }}</dd>
          <dt>状态</dt>
          <dd>{{ selectedLesson.status }}</dd>
        </dl>
        <button
          type="button"
          :disabled="selectedLesson.status === 'published' || publishing"
          @click="publishSelected()"
        >
          {{ publishing ? '发布中…' : '发布课程' }}
        </button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.lesson-page {
  max-width: 56rem;
  margin: 2rem auto;
  font-family: system-ui, sans-serif;
}

.filters,
.content {
  display: flex;
  gap: 1rem;
  align-items: end;
}

.content {
  align-items: start;
  margin-top: 1.5rem;
}

ul,
section {
  flex: 1;
}

li {
  margin-block: 0.5rem;
}

label {
  display: grid;
  gap: 0.25rem;
}
</style>
