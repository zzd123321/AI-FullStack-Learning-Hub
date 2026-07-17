<script lang="ts">
import type { InjectionKey, Ref } from 'vue'

export interface LessonSelectionContext {
  selectedId: Readonly<Ref<string | null>>
  select(id: string): void
  clear(): void
}

// Symbol 避免字符串键冲突，InjectionKey 同步 Provider / Consumer 类型。
export const lessonSelectionKey = Symbol(
  'lesson-selection'
) as InjectionKey<LessonSelectionContext>
</script>

<script setup lang="ts">
import { provide, readonly, ref } from 'vue'

defineSlots<{
  default(props: {
    selectedId: string | null
    select(id: string): void
    clear(): void
  }): unknown
}>()

const selectedId = ref<string | null>(null)

function select(id: string): void {
  selectedId.value = id
}

function clear(): void {
  selectedId.value = null
}

const context: LessonSelectionContext = {
  // Consumer 只能读取状态；所有写入都经过下面两个命名操作。
  selectedId: readonly(selectedId),
  select,
  clear
}

provide(lessonSelectionKey, context)
</script>

<template>
  <slot
    :selected-id="selectedId"
    :select="select"
    :clear="clear"
  />
</template>
