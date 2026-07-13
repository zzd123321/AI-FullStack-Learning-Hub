<script setup lang="ts">
import BaseToggle from './BaseToggle.vue'

defineProps<{ value: boolean; label: string }>()
const emit = defineEmits<{ input: [value: boolean] }>()
</script>

<template>
  <BaseToggle
    :model-value="value"
    :label="label"
    @update:model-value="emit('input', $event)"
  />
</template>
