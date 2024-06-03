import 'dayjs/locale/en'
import 'dayjs/locale/ja'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'

import Area from '@/logic/Area'
import { useDark, usePreferredDark, usePreferredLanguages } from '@vueuse/core'
import en from 'element-plus/es/locale/lang/en'
import ja from 'element-plus/es/locale/lang/ja'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'

export const supportedLanguages = [
  {
    label: '繁體中文',
    value: 'zh-tw'
  },
  {
    label: '简体中文',
    value: 'zh-cn'
  },
  {
    label: 'English',
    value: 'en'
  },
  {
    label: '日本語',
    value: 'ja'
  }
]

export const viewModes = {
  byLine: '線路群組',
  byBoss: '怪物群組'
}

export const predefineBossColor = ['#1D32B9', '#155C25', '#E1FF00']

export function getUserCurrentLanguage(...languages: string[]) {
  for (const language of languages
    .concat(usePreferredLanguages().value)
    .map((l) => l.toLocaleLowerCase())) {
    if (language.startsWith('ja')) {
      return 'ja'
    } else if (language.startsWith('zh-cn')) {
      return 'zh-cn'
    } else if (language.startsWith('zh')) {
      return 'zh-tw'
    } else if (language.startsWith('en')) {
      break
    }
  }
  return 'en'
}

function randomId() {
  return Math.random().toString(36).slice(2).toLocaleUpperCase()
}

export const useSettingStore = defineStore(
  'settings',
  () => {
    // normal setting
    const id = ref(randomId())
    const targetId = ref('')
    const language = ref(getUserCurrentLanguage())
    const darkMode = useDark()
    const showNickName = ref(false)
    const viewMode = ref('byBoss')
    const autosave = ref(true)
    const autoLoad = ref(true)
    const loadSavedExcludes = ref(true)

    // notification
    const showUserConnectNotification = ref(true)
    const showUserDisconnectNotification = ref(false)
    const showMonsterRespawnNotification = ref(false)
    const soundMonsterRespawnNotification = ref(false)

    // view table
    const areaTable = reactive({
      pageSize: 20
    })

    // show tab
    const showTimetable = ref(true)

    // line suggest
    const showBossCurrentTypeSuggestion = ref(true)
    const showBossSuggestion = ref(true)
    const showBossInfoRecentRespawn = ref(true)
    const showBossInfoRecentKilled = ref(true)
    const bossInfoCount = ref(10)
    const bossColor = ref('')

    // area setting
    const maxServerLine = reactive({} as Record<string, number>)
    const monsterRespawnTime = ref(60)
    const bossesExclude = ref([] as string[])
    const linesExclude = ref([] as number[])

    // data
    const save = reactive({
      areas: ''
    })

    const importExportText = ref('')

    // other
    const memo = ref('')

    // functions
    const resetId = () => {
      id.value = randomId()
    }

    const deleteSave = () => {
      save.areas = ''
    }

    const setMaxServerLine = () => {
      for (const [name, { maxLine }] of Object.entries(Area.defaultAreas)) {
        if (!maxServerLine[name]) {
          maxServerLine[name] = maxLine
        }
      }
    }

    const resetMaxServerLine = () => {
      Object.keys(maxServerLine).forEach((k) => delete maxServerLine[k])
      setMaxServerLine()
    }

    const resetSettings = () => {
      resetId()
      targetId.value = ''
      language.value = getUserCurrentLanguage()
      darkMode.value = usePreferredDark().value
      showNickName.value = false
      viewMode.value = 'byBoss'
      autosave.value = true
      autoLoad.value = true
      loadSavedExcludes.value = true
      bossColor.value = ''

      showUserConnectNotification.value = true
      showUserDisconnectNotification.value = false
      showMonsterRespawnNotification.value = false
      soundMonsterRespawnNotification.value = false

      areaTable.pageSize = 20

      showTimetable.value = true

      showBossCurrentTypeSuggestion.value = true
      showBossSuggestion.value = true
      showBossInfoRecentRespawn.value = true
      showBossInfoRecentKilled.value = true
      bossInfoCount.value = 10

      resetMaxServerLine()
      monsterRespawnTime.value = 60
      bossesExclude.value = []
      linesExclude.value = []
    }

    // compute
    const locale = computed(() => {
      switch (language.value) {
        case 'zh-tw':
          return zhTw
        case 'zh-cn':
          return zhCn
        case 'ja':
          return ja
        default:
          return en
      }
    })

    // init
    setMaxServerLine()

    return {
      id,
      targetId,
      language,
      darkMode,
      showNickName,
      viewMode,
      autosave,
      autoLoad,
      loadSavedExcludes,
      bossColor,

      showUserConnectNotification,
      showUserDisconnectNotification,
      showMonsterRespawnNotification,
      soundMonsterRespawnNotification,

      areaTable,

      showTimetable,

      showBossCurrentTypeSuggestion,
      showBossSuggestion,
      showBossInfoRecentRespawn,
      showBossInfoRecentKilled,
      bossInfoCount,

      maxServerLine,
      monsterRespawnTime,
      bossesExclude,
      linesExclude,

      save,
      importExportText,
      memo,

      resetId,
      deleteSave,
      resetMaxServerLine,
      resetSettings,

      locale
    }
  },
  {
    persist: true
  }
)
