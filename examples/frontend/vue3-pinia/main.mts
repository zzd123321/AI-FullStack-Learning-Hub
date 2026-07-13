import { createApp } from 'vue'
import { createPinia } from 'pinia'
import LessonStorePage from './LessonStorePage.vue'

const app = createApp(LessonStorePage)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
