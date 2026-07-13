<script setup lang="ts">
import { nextTick, ref } from 'vue'

const count = ref(0)
const counterElement = ref<HTMLElement | null>(null)
const beforeFlush = ref('')
const afterFlush = ref('')

async function incrementThreeTimes(): Promise<void> {
  count.value += 1
  count.value += 1
  count.value += 1

  beforeFlush.value = counterElement.value?.textContent ?? ''
  await nextTick()
  afterFlush.value = counterElement.value?.textContent ?? ''
}
</script>

<template>
  <section>
    <p ref="counterElement">当前计数：{{ count }}</p>
    <button type="button" @click="incrementThreeTimes()">连续增加三次</button>
    <dl>
      <dt>等待 nextTick 前读取 DOM</dt>
      <dd>{{ beforeFlush }}</dd>
      <dt>等待 nextTick 后读取 DOM</dt>
      <dd>{{ afterFlush }}</dd>
    </dl>
  </section>
</template>
