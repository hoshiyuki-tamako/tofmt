import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import App from "./App.vue";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import router from "./router";
import "./assets/main.sass";
import { createI18n } from "vue-i18n";
import { messages } from "./locale";

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
