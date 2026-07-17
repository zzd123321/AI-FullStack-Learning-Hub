<script setup lang="ts">
import { useId } from 'vue'

defineOptions({
  inheritAttrs: false
})

interface Props {
  label: string
  error?: string
}

defineProps<Props>()

const model = defineModel<string>({
  required: true
})

// 每个组件实例获得稳定且不冲突的 input / error 关联 ID。
const inputId = useId()
const errorId = `${inputId}-error`
</script>

<template>
  <div class="field">
    <label :for="inputId">{{ label }}</label>
    <input
      :id="inputId"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="Boolean(error)"
      :aria-describedby="error ? errorId : undefined"
    />
    <p v-if="error" :id="errorId" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.35rem;
}
</style>
