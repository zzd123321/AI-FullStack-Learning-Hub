<script setup lang="ts">
import { computed, ref } from 'vue'

const visits = ref([120, 188, 156, 240, 310])
const total = computed(() => visits.value.reduce((sum, value) => sum + value, 0))
</script>

<template>
  <section>
    <h2>课程访问分析</h2>
    <p>最近五天访问量：{{ total }}</p>
  </section>
</template>
