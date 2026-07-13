<script setup lang="ts">
const props = defineProps<{
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
}>()

const hintId = `${props.id}-hint`
const errorId = `${props.id}-error`
</script>

<template>
  <div class="field">
    <label :for="id">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>

    <p v-if="hint" :id="hintId" class="hint">{{ hint }}</p>

    <slot
      :describedBy="[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined"
      :invalid="Boolean(error)"
    />

    <p v-if="error" :id="errorId" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.35rem;
}

.hint {
  color: #555;
  margin: 0;
}

.error {
  color: #b42318;
  margin: 0;
}
</style>
