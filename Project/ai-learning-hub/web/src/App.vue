<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

const apiStatus = ref('正在检查 API…')
const mode = ref<'login' | 'register'>('register')
const email = ref('')
const password = ref('')
const displayName = ref('')
const accessToken = ref('')
const currentUser = ref<CurrentUser | null>(null)
const message = ref('')
const submitting = ref(false)
const paths = ref<PathItem[]>([])
const selectedPath = ref<PathDetail | null>(null)
const selectedCourse = ref<CourseDetail | null>(null)
const selectedKnowledgePoint = ref<KnowledgePointItem | null>(null)
const catalogMessage = ref('正在加载学习路线…')
const adminPaths = ref<PathItem[]>([])
const adminCourses = ref<CourseItem[]>([])
const adminKnowledgePoints = ref<KnowledgePointItem[]>([])
const adminMessage = ref('')
const adminLoading = ref(false)
const pathForm = reactive({ title: '', summary: '', sortOrder: 0 })
const courseForm = reactive({ pathId: 0, title: '', summary: '', sortOrder: 0 })
const knowledgePointForm = reactive({ courseId: 0, title: '', content: '# 新知识点\n\n在这里编写 Markdown 正文。', estimatedMinutes: 15, sortOrder: 0 })

type CurrentUser = {
  id: number
  email: string
  displayName: string
  roles: string[]
}

type PathItem = { id: number; title: string; summary: string; status: string; sortOrder: number }
type CourseItem = { id: number; pathId: number; title: string; summary: string; status: string; sortOrder: number }
type KnowledgePointItem = {
  id: number; courseId: number; title: string; content: string; estimatedMinutes: number; status: string; sortOrder: number
}
type PathDetail = { path: PathItem; courses: CourseItem[] }
type CourseDetail = { course: CourseItem; knowledgePoints: KnowledgePointItem[] }

const formTitle = computed(() => (mode.value === 'register' ? '创建学习账号' : '登录学习账号'))
const isContentAdmin = computed(() => currentUser.value?.roles.includes('CONTENT_ADMIN') ?? false)

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return body?.error?.message ?? '请求失败，请稍后重试。'
}

async function submit() {
  message.value = ''
  submitting.value = true
  try {
    const path = mode.value === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login'
    const payload = mode.value === 'register'
      ? { email: email.value, password: password.value, displayName: displayName.value }
      : { email: email.value, password: password.value }
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    })
    if (!response.ok) throw new Error(await readError(response))
    const result = (await response.json()) as { accessToken: string; user: CurrentUser }
    accessToken.value = result.accessToken
    currentUser.value = result.user
    message.value = mode.value === 'register' ? '注册并登录成功。' : '登录成功。'
    if (isContentAdmin.value) await loadAdminCatalog()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '请求失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

async function loadCurrentUser() {
  message.value = ''
  const response = await fetch('/api/v1/me', {
    headers: { Authorization: `Bearer ${accessToken.value}` },
    credentials: 'include'
  })
  if (!response.ok) {
    message.value = await readError(response)
    return
  }
  currentUser.value = (await response.json()) as CurrentUser
  message.value = 'access token 验证成功。'
  if (isContentAdmin.value) await loadAdminCatalog()
}

async function logout() {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
  accessToken.value = ''
  currentUser.value = null
  adminPaths.value = []
  adminCourses.value = []
  adminKnowledgePoints.value = []
  adminMessage.value = ''
  message.value = '已登出，刷新 Cookie 已清除。'
}

async function loadPaths() {
  catalogMessage.value = '正在加载学习路线…'
  try {
    const response = await fetch('/api/v1/paths')
    if (!response.ok) throw new Error(await readError(response))
    paths.value = (await response.json()) as PathItem[]
    catalogMessage.value = paths.value.length ? '' : '还没有已发布的学习路线。'
  } catch (error) {
    catalogMessage.value = error instanceof Error ? error.message : '学习路线加载失败。'
  }
}

async function openPath(id: number) {
  const response = await fetch(`/api/v1/paths/${id}`)
  if (!response.ok) { catalogMessage.value = await readError(response); return }
  selectedPath.value = (await response.json()) as PathDetail
  selectedCourse.value = null
  selectedKnowledgePoint.value = null
}

async function openCourse(id: number) {
  const response = await fetch(`/api/v1/courses/${id}`)
  if (!response.ok) { catalogMessage.value = await readError(response); return }
  selectedCourse.value = (await response.json()) as CourseDetail
  selectedKnowledgePoint.value = null
}

async function openKnowledgePoint(id: number) {
  const response = await fetch(`/api/v1/knowledge-points/${id}`)
  if (!response.ok) { catalogMessage.value = await readError(response); return }
  selectedKnowledgePoint.value = (await response.json()) as KnowledgePointItem
}

async function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(`/api/v1/admin${path}`, {
    ...init,
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken.value}`, 'Content-Type': 'application/json', ...init.headers }
  })
}

async function loadAdminCatalog() {
  if (!isContentAdmin.value || !accessToken.value) return
  adminLoading.value = true
  adminMessage.value = ''
  try {
    const responses = await Promise.all([adminFetch('/paths'), adminFetch('/courses'), adminFetch('/knowledge-points')])
    if (responses.some((response) => !response.ok)) throw new Error(await readError(responses.find((response) => !response.ok) as Response))
    const [pathData, courseData, pointData] = await Promise.all(responses.map((response) => response.json()))
    adminPaths.value = pathData as PathItem[]
    adminCourses.value = courseData as CourseItem[]
    adminKnowledgePoints.value = pointData as KnowledgePointItem[]
    if (!courseForm.pathId && adminPaths.value[0]) courseForm.pathId = adminPaths.value[0].id
    if (!knowledgePointForm.courseId && adminCourses.value[0]) knowledgePointForm.courseId = adminCourses.value[0].id
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '管理内容加载失败。'
  } finally {
    adminLoading.value = false
  }
}

async function createPath() {
  await submitAdmin('/paths', pathForm, '已创建路线。')
  pathForm.title = ''; pathForm.summary = ''; pathForm.sortOrder = 0
}

async function createCourse() {
  if (!courseForm.pathId) { adminMessage.value = '请先创建并选择一条学习路线。'; return }
  await submitAdmin('/courses', courseForm, '已创建课程。')
  courseForm.title = ''; courseForm.summary = ''; courseForm.sortOrder = 0
}

async function createKnowledgePoint() {
  if (!knowledgePointForm.courseId) { adminMessage.value = '请先创建并选择一门课程。'; return }
  await submitAdmin('/knowledge-points', knowledgePointForm, '已创建 Markdown 知识点。')
  knowledgePointForm.title = ''; knowledgePointForm.content = '# 新知识点\n\n在这里编写 Markdown 正文。'; knowledgePointForm.estimatedMinutes = 15; knowledgePointForm.sortOrder = 0
}

async function submitAdmin(path: string, body: object, successMessage: string) {
  adminLoading.value = true
  adminMessage.value = ''
  try {
    const response = await adminFetch(path, { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error(await readError(response))
    adminMessage.value = successMessage
    await Promise.all([loadAdminCatalog(), loadPaths()])
  } catch (error) {
    adminMessage.value = error instanceof Error ? error.message : '提交失败。'
  } finally {
    adminLoading.value = false
  }
}

async function changeContentStatus(resource: 'paths' | 'courses' | 'knowledge-points', id: number, action: 'publish' | 'archive') {
  await submitAdmin(`/${resource}/${id}/${action}`, {}, action === 'publish' ? '内容已发布。' : '内容已归档。')
}

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/health')
    const data = (await response.json()) as { status: string; service: string }
    apiStatus.value = `${data.service}: ${data.status}`
  } catch {
    apiStatus.value = 'API 未启动，请先启动后端服务。'
  }
  await loadPaths()
})
</script>

<template>
  <main>
    <p class="eyebrow">步骤 5 · 内容目录</p>
    <h1>AI Learning Hub</h1>
    <p>先浏览已发布的学习内容；登录后可继续体验身份认证闭环。</p>
    <p class="status" role="status">{{ apiStatus }}</p>

    <section class="card catalog">
      <div class="section-title"><h2>学习路线</h2><button type="button" @click="loadPaths">刷新</button></div>
      <p v-if="catalogMessage" class="message" role="status">{{ catalogMessage }}</p>
      <div v-else class="content-list">
        <button v-for="path in paths" :key="path.id" class="content-button" type="button" @click="openPath(path.id)">
          <strong>{{ path.title }}</strong><span>{{ path.summary }}</span>
        </button>
      </div>

      <div v-if="selectedPath" class="content-detail">
        <h3>{{ selectedPath.path.title }}</h3>
        <p>{{ selectedPath.path.summary }}</p>
        <p v-if="!selectedPath.courses.length">这条路线暂时没有已发布课程。</p>
        <div v-else class="content-list">
          <button v-for="course in selectedPath.courses" :key="course.id" class="content-button" type="button" @click="openCourse(course.id)">
            <strong>{{ course.title }}</strong><span>{{ course.summary }}</span>
          </button>
        </div>
      </div>

      <div v-if="selectedCourse" class="content-detail">
        <h3>{{ selectedCourse.course.title }}</h3>
        <p>{{ selectedCourse.course.summary }}</p>
        <p v-if="!selectedCourse.knowledgePoints.length">这门课程暂时没有已发布知识点。</p>
        <div v-else class="content-list">
          <button v-for="point in selectedCourse.knowledgePoints" :key="point.id" class="content-button" type="button" @click="openKnowledgePoint(point.id)">
            <strong>{{ point.title }}</strong><span>预计 {{ point.estimatedMinutes }} 分钟</span>
          </button>
        </div>
      </div>

      <article v-if="selectedKnowledgePoint" class="content-detail markdown-content">
        <h3>{{ selectedKnowledgePoint.title }}</h3>
        <p>预计 {{ selectedKnowledgePoint.estimatedMinutes }} 分钟</p>
        <pre>{{ selectedKnowledgePoint.content }}</pre>
      </article>
    </section>

    <section v-if="!currentUser" class="card">
      <div class="tabs" role="tablist" aria-label="账号操作">
        <button :class="{ active: mode === 'register' }" type="button" @click="mode = 'register'">注册</button>
        <button :class="{ active: mode === 'login' }" type="button" @click="mode = 'login'">登录</button>
      </div>
      <h2>{{ formTitle }}</h2>
      <form @submit.prevent="submit">
        <label v-if="mode === 'register'">显示名
          <input v-model.trim="displayName" required maxlength="50" autocomplete="name" />
        </label>
        <label>邮箱
          <input v-model.trim="email" required type="email" autocomplete="email" />
        </label>
        <label>密码
          <input v-model="password" required minlength="8" maxlength="72" type="password" autocomplete="current-password" />
        </label>
        <button class="primary" :disabled="submitting" type="submit">{{ submitting ? '提交中…' : formTitle }}</button>
      </form>
    </section>

    <section v-else class="card">
      <h2>欢迎，{{ currentUser.displayName }}</h2>
      <p>{{ currentUser.email }} · {{ currentUser.roles.join('、') }}</p>
      <div class="actions">
        <button class="primary" type="button" @click="loadCurrentUser">验证当前身份</button>
        <button type="button" @click="logout">登出</button>
      </div>
    </section>

    <section v-if="isContentAdmin" class="card admin-panel">
      <div class="section-title"><h2>内容管理</h2><button type="button" :disabled="adminLoading" @click="loadAdminCatalog">刷新草稿</button></div>
      <p>仅内容管理员可见。新内容默认是草稿；请按路线、课程、知识点的顺序发布。</p>
      <p v-if="adminMessage" class="message" role="status">{{ adminMessage }}</p>

      <div class="admin-grid">
        <form @submit.prevent="createPath">
          <h3>新建学习路线</h3>
          <label>标题<input v-model.trim="pathForm.title" required maxlength="120" /></label>
          <label>简介<input v-model.trim="pathForm.summary" required maxlength="500" /></label>
          <label>排序<input v-model.number="pathForm.sortOrder" required min="0" type="number" /></label>
          <button class="primary" :disabled="adminLoading" type="submit">保存草稿</button>
        </form>

        <form @submit.prevent="createCourse">
          <h3>新建课程</h3>
          <label>所属路线<select v-model.number="courseForm.pathId" required><option :value="0" disabled>请选择路线</option><option v-for="path in adminPaths" :key="path.id" :value="path.id">{{ path.title }}</option></select></label>
          <label>标题<input v-model.trim="courseForm.title" required maxlength="120" /></label>
          <label>简介<input v-model.trim="courseForm.summary" required maxlength="500" /></label>
          <label>排序<input v-model.number="courseForm.sortOrder" required min="0" type="number" /></label>
          <button class="primary" :disabled="adminLoading" type="submit">保存草稿</button>
        </form>

        <form @submit.prevent="createKnowledgePoint">
          <h3>新建知识点</h3>
          <label>所属课程<select v-model.number="knowledgePointForm.courseId" required><option :value="0" disabled>请选择课程</option><option v-for="course in adminCourses" :key="course.id" :value="course.id">{{ course.title }}</option></select></label>
          <label>标题<input v-model.trim="knowledgePointForm.title" required maxlength="160" /></label>
          <label>预计分钟<input v-model.number="knowledgePointForm.estimatedMinutes" required min="1" max="1440" type="number" /></label>
          <label>排序<input v-model.number="knowledgePointForm.sortOrder" required min="0" type="number" /></label>
          <label>Markdown 正文<textarea v-model="knowledgePointForm.content" required rows="8" /></label>
          <button class="primary" :disabled="adminLoading" type="submit">保存草稿</button>
        </form>
      </div>

      <div class="admin-list">
        <h3>路线状态</h3>
        <p v-if="!adminPaths.length">暂无路线。</p>
        <div v-for="path in adminPaths" :key="path.id" class="admin-row"><span><strong>{{ path.title }}</strong> · {{ path.status }}</span><button v-if="path.status !== 'PUBLISHED'" type="button" @click="changeContentStatus('paths', path.id, 'publish')">发布</button><button v-if="path.status !== 'ARCHIVED'" type="button" @click="changeContentStatus('paths', path.id, 'archive')">归档</button></div>
        <h3>课程状态</h3>
        <p v-if="!adminCourses.length">暂无课程。</p>
        <div v-for="course in adminCourses" :key="course.id" class="admin-row"><span><strong>{{ course.title }}</strong> · {{ course.status }}</span><button v-if="course.status !== 'PUBLISHED'" type="button" @click="changeContentStatus('courses', course.id, 'publish')">发布</button><button v-if="course.status !== 'ARCHIVED'" type="button" @click="changeContentStatus('courses', course.id, 'archive')">归档</button></div>
        <h3>知识点状态</h3>
        <p v-if="!adminKnowledgePoints.length">暂无知识点。</p>
        <div v-for="point in adminKnowledgePoints" :key="point.id" class="admin-row"><span><strong>{{ point.title }}</strong> · {{ point.status }}</span><button v-if="point.status !== 'PUBLISHED'" type="button" @click="changeContentStatus('knowledge-points', point.id, 'publish')">发布</button><button v-if="point.status !== 'ARCHIVED'" type="button" @click="changeContentStatus('knowledge-points', point.id, 'archive')">归档</button></div>
      </div>
    </section>
    <p v-if="message" class="message" role="status">{{ message }}</p>
  </main>
</template>
