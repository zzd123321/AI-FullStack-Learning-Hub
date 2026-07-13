<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import EditorPanel from './EditorPanel.vue'
import PreviewPanel from './PreviewPanel.vue'

type PanelName = 'editor' | 'preview'

const activeName = shallowRef<PanelName>('editor')
const activeComponent = computed(() =>
  activeName.value === 'editor' ? EditorPanel : PreviewPanel
)
</script>

<template>
  <section>
    <nav aria-label="工作区面板">
      <button type="button" @click="activeName = 'editor'">编辑器</button>
      <button type="button" @click="activeName = 'preview'">预览</button>
    </nav>

    <KeepAlive :max="2">
      <component :is="activeComponent" />
    </KeepAlive>
  </section>
</template>
