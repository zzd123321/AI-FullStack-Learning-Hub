<script setup lang="ts">
defineProps<{
  error: Error
}>()
</script>

<template>
  <p role="alert">分析面板加载失败：{{ error.message }}</p>
</template>
