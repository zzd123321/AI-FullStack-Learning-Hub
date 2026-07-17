import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './MigrationPage.vue'
import { createAppRouter } from './router'

const app = createApp(App)

app.use(createPinia())
// 工厂让每个测试、微前端入口或 SSR 请求都能拥有独立 Router。
app.use(createAppRouter())
app.mount('#app')
