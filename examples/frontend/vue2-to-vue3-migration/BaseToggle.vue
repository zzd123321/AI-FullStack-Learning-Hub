<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function update(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    emit('update:modelValue', target.checked)
  }
}
</script>

<template>
  <label>
    <input
      type="checkbox"
      :checked="modelValue"
      @change="update"
    >
    {{ label }}
  </label>
</template>
