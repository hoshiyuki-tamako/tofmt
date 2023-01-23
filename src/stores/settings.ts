import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { ulid } from "ulid";
import Area from "@/logic/Area";
import { useDark } from "@vueuse/core";
// import { zhTw, zhCn, en, ja } from "element-plus/lib/locale";
import zhTw from "element-plus/dist/locale/zh-tw.mjs";
import zhCn from "element-plus/dist/locale/zh-cn.mjs";
import en from "element-plus/dist/locale/en.mjs";
import ja from "element-plus/dist/locale/ja.mjs";
// new locale please also add dayjs locale in App.vue

export const supportedLanguages = [
  {
    label: "繁體中文",
    value: "zh-tw",
  },
  {
    label: "简体中文",
    value: "zh-cn",
  },
  {
    label: "English",
    value: "en",
  },
  {
    label: "日本語",
    value: "ja",
  },
];

export const viewModes = {
  byLine: "線路群組",
  byBoss: "怪物群組",
};

function getUserCurrentLanguage() {
  let language = navigator.languages?.[0] ?? navigator.language ?? "en";
  language = language.toLocaleLowerCase();

  if (language.startsWith("en")) {
    language = "en";
  } else if (language.startsWith("ja")) {
    language = "ja";
  } else if (language.startsWith("zh")) {
    if (!["zh-tw", "zh-cn"].includes(language)) {
      language = "zh-tw";
    }
  } else {
    language = "en";
  }

  return language;
}

export const useSettings = defineStore(
  "settings",
  () => {
    // normal setting
    const id = ref(ulid().slice(0, 8));
    const targetId = ref("");
    const language = ref(getUserCurrentLanguage());
    const darkMode = useDark();
    const showNickName = ref(false);
    const viewMode = ref("byLine");
    const autosave = ref(false);

    // notification
    const showUserConnectNotification = ref(true);
    const showUserDisconnectNotification = ref(false);
    const showMonsterRespawnNotification = ref(false);

    // view table
    const areaTable = reactive({
      pageSize: 10,
    });

    // line suggest
    const showBossCurrentTypeSuggestion = ref(true);
    const showBossSuggestion = ref(true);
    const showBossInfoRecentKilled = ref(true);
    const bossInfoCount = ref(10);

    // area setting
    const maxServerLine = reactive({} as Record<string, number>);
    const monsterRespawnTime = ref(60);
    const bossesExclude = ref([] as string[]);
    const linesExclude = ref([] as number[]);

    // data
    const save = reactive({
      areas: "",
    });

    const importExportText = ref("");

    // init
    function resetMaxServerLine() {
      Object.keys(maxServerLine).forEach((k) => delete maxServerLine[k]);
      for (const [name, { maxLine }] of Object.entries(Area.defaultAreas)) {
        if (!maxServerLine[name]) {
          maxServerLine[name] = maxLine;
        }
      }
    }
    if (!Object.keys(maxServerLine).length) {
      resetMaxServerLine();
    }

    // compute
    const resetSettings = () => {
      id.value = ulid().slice(0, 8);
      targetId.value = "";
      language.value = getUserCurrentLanguage();
      darkMode.value = useDark().value;
      showNickName.value = false;
      viewMode.value = "byLine";
      autosave.value = false;

      showUserConnectNotification.value = true;
      showUserDisconnectNotification.value = false;
      showMonsterRespawnNotification.value = false;

      areaTable.pageSize = 10;

      bossInfoCount.value = 10;

      resetMaxServerLine();
      monsterRespawnTime.value = 60;
      bossesExclude.value = [];
      linesExclude.value = [];

      importExportText.value = "";
    };

    const deleteSave = () => {
      save.areas = "";
    };

    const locale = computed(() => {
      switch (language.value) {
        case "zh-tw":
          return zhTw;
        case "zh-cn":
          return zhCn;
        case "ja-jp":
          return ja;
        default:
          return en;
      }
    });

    return {
      id,
      targetId,
      language,
      darkMode,
      showNickName,
      viewMode,
      autosave,

      showUserConnectNotification,
      showUserDisconnectNotification,
      showMonsterRespawnNotification,

      areaTable,

      showBossCurrentTypeSuggestion,
      showBossSuggestion,
      showBossInfoRecentKilled,
      bossInfoCount,

      maxServerLine,
      monsterRespawnTime,
      bossesExclude,
      linesExclude,

      save,
      importExportText,

      resetSettings,
      deleteSave,
      resetMaxServerLine,

      locale,
    };
  },
  {
    persist: true,
  }
);
