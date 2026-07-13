<script setup lang="ts">
defineProps<{ id: string }>()
</script>

<template>
  <main>
    <h1>课程详情</h1>
    <p>课程 ID：{{ id }}</p>
  </main>
</template>
