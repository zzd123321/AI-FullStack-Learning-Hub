<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import ErrorPanel from './ErrorPanel.vue'
import LoadingPanel from './LoadingPanel.vue'

const visible = ref(false)

const AnalyticsPanel = defineAsyncComponent({
  loader: () => import('./AnalyticsPanel.vue'),
  loadingComponent: LoadingPanel,
  errorComponent: ErrorPanel,
  delay: 150,
  timeout: 10_000,
  onError(_error, retry, fail, attempts) {
    // 演示有限重试；生产环境还应只重试可恢复的网络错误。
    if (attempts <= 2) globalThis.setTimeout(retry, attempts * 500)
    else fail()
  }
})
</script>

<template>
  <section>
    <button type="button" @click="visible = !visible">
      {{ visible ? '关闭' : '打开' }}分析面板
    </button>
    <AnalyticsPanel v-if="visible" />
  </section>
</template>
