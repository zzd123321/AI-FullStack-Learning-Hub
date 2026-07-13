<script setup lang="ts">
import { ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

const props = defineProps<{
  lessonId: string
}>()

const router = useRouter()
const title = ref('')
const dirty = ref(false)

onBeforeRouteLeave(() => {
  if (!dirty.value) return true
  return window.confirm('修改尚未保存，确定离开吗？')
})

async function save(): Promise<void> {
  // 实际项目在这里调用服务层并处理错误。
  dirty.value = false
  await router.replace({
    name: 'lesson-detail',
    params: { lessonId: props.lessonId }
  })
}
</script>

<template>
  <form @submit.prevent="save()">
    <h1>编辑课程</h1>
    <label>
      标题
      <input v-model="title" @input="dirty = true" />
    </label>
    <button type="submit">保存</button>
  </form>
</template>
