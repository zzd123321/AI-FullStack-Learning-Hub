<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = defineProps<{
  redirect: string
}>()

const router = useRouter()

async function login(): Promise<void> {
  // 登录成功后使用 replace，避免浏览器后退再次回到登录页。
  await router.replace(props.redirect)
}
</script>

<template>
  <main>
    <h1>登录</h1>
    <button type="button" @click="login()">模拟登录并继续</button>
  </main>
</template>
