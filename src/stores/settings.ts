import "dayjs/locale/en";
import "dayjs/locale/ja";
import "dayjs/locale/zh-cn";
import "dayjs/locale/zh-tw";

import Area from "@/logic/Area";
import { useDark } from "@vueuse/core";
import en from "element-plus/lib/locale/lang/en";
import ja from "element-plus/lib/locale/lang/ja";
import zhCn from "element-plus/lib/locale/lang/zh-cn";
import zhTw from "element-plus/lib/locale/lang/zh-tw";
import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";

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

function randomId() {
  return Math.random().toString(36).slice(2).toLocaleUpperCase();
}

export const useSettings = defineStore(
  "settings",
  () => {
    // normal setting
    const id = ref(randomId());
    const targetId = ref("");
    const language = ref(getUserCurrentLanguage());
    const darkMode = useDark();
    const showNickName = ref(false);
    const viewMode = ref("byBoss");
    const autosave = ref(false);
    const loadSavedExcludes = ref(true);

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

    // functions
    const resetId = () => {
      id.value = randomId();
    };

    const deleteSave = () => {
      save.areas = "";
    };

    const resetMaxServerLine = () => {
      Object.keys(maxServerLine).forEach((k) => delete maxServerLine[k]);
      for (const [name, { maxLine }] of Object.entries(Area.defaultAreas)) {
        if (!maxServerLine[name]) {
          maxServerLine[name] = maxLine;
        }
      }
    };

    const resetSettings = () => {
      resetId();
      targetId.value = "";
      language.value = getUserCurrentLanguage();
      darkMode.value = useDark().value;
      showNickName.value = false;
      viewMode.value = "byBoss";
      autosave.value = false;
      loadSavedExcludes.value = true;

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

    // compute
    const locale = computed(() => {
      switch (language.value) {
        case "zh-tw":
          return zhTw;
        case "zh-cn":
          return zhCn;
        case "ja":
          return ja;
        default:
          return en;
      }
    });

    // init
    if (!Object.keys(maxServerLine).length) {
      resetMaxServerLine();
    }

    return {
      id,
      targetId,
      language,
      darkMode,
      showNickName,
      viewMode,
      autosave,
      loadSavedExcludes,

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

      resetId,
      deleteSave,
      resetMaxServerLine,
      resetSettings,

      locale,
    };
  },
  {
    persist: true,
  }
);
