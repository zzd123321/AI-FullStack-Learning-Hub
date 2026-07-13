<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import {
  EnrollmentError,
  type EnrollmentReceipt,
  type EnrollmentService
} from './enrollment-contract.js'

const props = defineProps<{
  lessonId: string
  service: EnrollmentService
}>()

const email = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const receipt = ref<EnrollmentReceipt | null>(null)
let controller: AbortController | undefined

async function enroll(): Promise<void> {
  if (pending.value) return

  pending.value = true
  error.value = null
  receipt.value = null
  controller = new AbortController()

  try {
    receipt.value = await props.service.enroll(
      props.lessonId,
      email.value.trim(),
      controller.signal
    )
  } catch (cause: unknown) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    error.value =
      cause instanceof EnrollmentError ? cause.message : '报名失败，请稍后重试'
  } finally {
    pending.value = false
    controller = undefined
  }
}

onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <form aria-labelledby="enrollment-title" @submit.prevent="enroll()">
    <h2 id="enrollment-title">报名课程</h2>
    <label for="enrollment-email">邮箱</label>
    <input
      id="enrollment-email"
      v-model="email"
      type="email"
      autocomplete="email"
      required
    />
    <button type="submit" :disabled="pending">
      {{ pending ? '报名中…' : '确认报名' }}
    </button>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="receipt" role="status">
      报名成功：{{ receipt.enrollmentId }}
    </p>
  </form>
</template>
