<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import type { LessonGateway, LessonSummary } from './contracts'

export default defineComponent({
  name: 'LegacyLessonSearch',
  props: {
    gateway: { type: Object as PropType<LessonGateway>, required: true }
  },
  emits: {
    select: (lesson: LessonSummary) => lesson.id.length > 0
  },
  data() {
    return {
      keyword: '',
      items: [] as LessonSummary[],
      loading: false,
      error: null as string | null,
      requestId: 0,
      controller: undefined as AbortController | undefined
    }
  },
  watch: {
    keyword: 'search'
  },
  created() {
    void this.search()
  },
  beforeUnmount() {
    this.requestId += 1
    this.controller?.abort()
  },
  methods: {
    async search() {
      this.controller?.abort()
      this.controller = new AbortController()
      const currentRequestId = ++this.requestId
      this.loading = true
      this.error = null

      try {
        const result = await this.gateway.search(
          { keyword: this.keyword, page: 1, pageSize: 20 },
          this.controller.signal
        )
        if (currentRequestId === this.requestId) this.items = result.items
      } catch (cause: unknown) {
        if (
          currentRequestId === this.requestId &&
          !(cause instanceof DOMException && cause.name === 'AbortError')
        ) {
          this.error = cause instanceof Error ? cause.message : '搜索失败'
        }
      } finally {
        if (currentRequestId === this.requestId) this.loading = false
      }
    }
  }
})
</script>

<template>
  <section>
    <label>搜索课程 <input v-model.trim="keyword" type="search"></label>
    <p v-if="loading">搜索中…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <ul v-else>
      <li v-for="lesson in items" :key="lesson.id">
        <button type="button" @click="$emit('select', lesson)">
          {{ lesson.title }}
        </button>
      </li>
    </ul>
  </section>
</template>
