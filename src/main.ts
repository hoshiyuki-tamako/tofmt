import "./assets/main.sass";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";

import ElementPlus from "element-plus";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createApp } from "vue";
import { createI18n } from "vue-i18n";

import App from "./App.vue";
import { messages } from "./locale";
import router from "./router";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const i18n = createI18n({
  legacy: false,
  locale: "zh-tw",
  fallbackLocale: "zh-tw",
  messages,
});

const app = createApp(App);

app.use(ElementPlus);
app.use(i18n);
app.use(pinia);
app.use(router);

app.mount("#app");
