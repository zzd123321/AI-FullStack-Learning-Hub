<script setup lang="ts">
import { computed } from 'vue'
import LegacyLessonSearch from './LegacyLessonSearch.vue'
import LessonSearch from './LessonSearch.vue'
import { createHttpLessonGateway } from './lesson-gateway'
import { rolloutFlags } from './migration-runtime'
import { useLessonSelectionStore } from './lesson-store'

const gateway = createHttpLessonGateway()
const selection = useLessonSelectionStore()
const SearchComponent = computed(() =>
  rolloutFlags.vue3LessonSearch ? LessonSearch : LegacyLessonSearch
)
</script>

<template>
  <main>
    <h1>课程搜索</h1>
    <component
      :is="SearchComponent"
      :gateway="gateway"
      @select="selection.select"
    />
    <p v-if="selection.selected">已选择：{{ selection.selected.title }}</p>
  </main>
</template>
