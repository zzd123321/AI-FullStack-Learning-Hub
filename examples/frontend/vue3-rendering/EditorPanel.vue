<script setup lang="ts">
import { onActivated, onDeactivated, ref } from 'vue'

const draft = ref('')
const lifecycle = ref('已创建')

onActivated(() => {
  lifecycle.value = '已激活'
})

onDeactivated(() => {
  lifecycle.value = '已停用并保留实例'
})
</script>

<template>
  <section>
    <h2>编辑器</h2>
    <label>
      临时草稿
      <textarea v-model="draft" />
    </label>
    <p>{{ lifecycle }}</p>
  </section>
</template>
