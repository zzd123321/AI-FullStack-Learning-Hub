<script setup lang="ts">
import { ref } from 'vue'

const zoom = ref(100)
</script>

<template>
  <section>
    <h2>预览</h2>
    <label>
      缩放比例
      <input v-model.number="zoom" type="range" min="50" max="150" />
    </label>
    <p>当前缩放：{{ zoom }}%</p>
  </section>
</template>
