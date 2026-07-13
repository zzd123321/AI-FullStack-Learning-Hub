<script setup lang="ts">
import { onMounted, ref } from 'vue'

const localTime = ref('')

// 时区依赖输出只在挂载后生成，避免服务端与浏览器首帧不同。
onMounted(() => {
  localTime.value = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date())
})
</script>

<template>
  <p v-if="localTime">你的本地时间：{{ localTime }}</p>
  <p v-else aria-hidden="true">正在读取本地时间…</p>
</template>
