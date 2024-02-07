import './assets/main.sass'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import App from './App.vue'
import { messages } from './locale'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const i18n = createI18n({
  legacy: false,
  locale: 'zh-tw',
  fallbackLocale: 'zh-tw',
  messages
})

const app = createApp(App)

app.use(i18n)
app.use(pinia)

app.mount('#app')
