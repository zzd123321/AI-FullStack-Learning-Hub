<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DsTabChangeDetail, DsTabsElement } from './ds-tabs.js';
import type { ActivationMode, TabDefinition } from './tabs-state.js';

const props = withDefaults(defineProps<{
  items: readonly TabDefinition[];
  selectedId?: string;
  activation?: ActivationMode;
  label: string;
}>(), {
  selectedId: '',
  activation: 'automatic',
});
const emit = defineEmits<{ change: [selectedId: string] }>();
const element = ref<DsTabsElement>();

const onChange = (event: Event) => {
  emit('change', (event as CustomEvent<DsTabChangeDetail>).detail.selectedId);
};

onMounted(() => {
  if (!element.value) return;
  element.value.items = props.items;
  element.value.addEventListener('ds-change', onChange);
});
onBeforeUnmount(() => element.value?.removeEventListener('ds-change', onChange));
watch(() => props.items, (items) => {
  if (element.value) element.value.items = items;
}, { immediate: true });
</script>

<template>
  <ds-tabs
    ref="element"
    :selected-id="selectedId"
    :activation="activation"
    :label="label"
  />
</template>
