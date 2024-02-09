<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import {
  useSettingStore,
  viewModes,
  supportedLanguages,
  getUserCurrentLanguage,
  predefineBossColor
} from '@/stores/settings'
import {
  Setting,
  Share,
  View,
  Search,
  DocumentAdd,
  Reading,
  CaretRight
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import Enumerable from 'linq'
import Peer from 'peerjs'
import dayjs, { type Dayjs } from 'dayjs'
import { Synth } from 'tone'
import Area from '@/logic/Area'
import MobileDetect from 'mobile-detect'
import SyncMessage from '@/logic/network/SyncMessage'
import MessageError from '@/exceptions/MessageError'

import type Server from '@/logic/Server'
import type { DataConnection } from 'peerjs'
import type BossEntity from '@/logic/BossEntity'

// stores
const settings = useSettingStore()
const { t, locale } = useI18n()

const urlLocale = new URL(window.location.toString()).searchParams.get('locale')
if (urlLocale) {
  settings.language = getUserCurrentLanguage(urlLocale)
}

// servers
type ConnectedPeerInfo = {
  connectionState: ConnectionState
  connectedAt: Dayjs
}

enum ConnectionState {
  disconnected,
  connecting,
  connected
}

// peer
const idValidationPattern = '[0-9a-zA-Z]+'
const idRemoveInvalidCharactersRegex = /[^0-9a-zA-Z]/g
const connectionPrefix = 'tofmt'
let peer: Peer | null
let connections = [] as DataConnection[]
const serverState = reactive({
  id: '',
  connectionState: ConnectionState.disconnected,
  connectedPeers: {} as Record<string, ConnectedPeerInfo>
})

function getPeerId(id: string) {
  return `${connectionPrefix}-${id}`
}
const hasConnection = computed(() => {
  return !!(serverState.connectionState || clientState.connectionState)
})

// client
let serverConnection: DataConnection | null
const clientState = reactive({
  connectionState: ConnectionState.disconnected,
  latestSyncMessageCreatedAt: dayjs.unix(0)
})

// server functions
function onServerError(e: Error) {
  ElNotification.error(e.message)
  console.error(e)
}

function onClickHostTable() {
  hostServerCleanUp()
  onClickCloseFollowing()

  if (!settings.id) {
    settings.resetId()
  }

  ElMessage(`${t('正在啟動分享')} ${settings.id}`)
  serverState.connectionState = ConnectionState.connecting

  peer = new Peer(getPeerId(settings.id))
  peer.on('open', () => {
    serverState.connectionState = ConnectionState.connected
    dialogs.hostDialogVisible = false
    ElMessage.success(t('已允許同步'))
  })
  peer.on('connection', (conn) => {
    connections.push(conn)
    serverState.connectedPeers[conn.peer] = {
      connectionState: ConnectionState.connecting,
      connectedAt: dayjs()
    }
    conn.on('open', () => {
      if (serverState.connectedPeers[conn.peer]) {
        serverState.connectedPeers[conn.peer].connectionState = ConnectionState.connected
      }
      if (settings.showUserConnectNotification) {
        ElMessage(t('user_connect', { id: conn.peer }))
      }
      return sendMonsterTable()
    })
    conn.on('close', () => {
      connections = Enumerable.from(connections)
        .where((c) => c !== conn)
        .toArray()
      delete serverState.connectedPeers[conn.peer]
      if (settings.showUserDisconnectNotification) {
        ElMessage(t('user_disconnect', { id: conn.peer }))
      }
    })
    conn.on('error', onServerError)
  })
  peer.on('disconnected', () => {
    hostServerCleanUp()
  })
  peer.on('error', (e) => {
    ElMessage.error(e.message)
    onServerError(e)
    onClickCloseHosting()
  })
}

function hostServerCleanUp() {
  for (const connection of connections) {
    connection.close()
  }
  connections = []
  peer?.disconnect()
  peer = null
  serverState.connectionState = ConnectionState.disconnected
  serverState.connectedPeers = {}
}

function onClickCloseHosting() {
  hostServerCleanUp()
}

function onClickFollowTable() {
  if (!settings.targetId) {
    ElNotification.error(t('目標 ID 不能為空'))
    return
  }

  if (!settings.id) {
    settings.resetId()
  }

  onClickCloseFollowing()
  onClickCloseHosting()

  ElMessage(`${t('正在連接到')} ${settings.targetId}`)
  clientState.connectionState = ConnectionState.connecting

  peer = new Peer(getPeerId(settings.id))
  peer.on('open', () => {
    serverConnection = peer?.connect(getPeerId(settings.targetId)) || null
    serverConnection?.on('open', () => {
      dialogs.connectDialogVisible = false
      clientState.connectionState = ConnectionState.connected
      ElMessage.success(t('已跟蹤'))
    })
    serverConnection?.on('data', (data) => {
      return receiveMonsterTable(data as ArrayBuffer)
    })
    serverConnection?.on('close', () => {
      if (clientState.connectionState) {
        onServerError(new Error(t('跟蹤連接已斷開')))
      }
      onClickCloseFollowing()
    })
  })
  peer.on('disconnected', () => {
    followTableCleanUp()
    ElMessage(t('已停止跟蹤'))
  })
  peer.on('error', (e) => {
    onServerError(e)
    onClickCloseFollowing()
  })
}

function followTableCleanUp() {
  serverConnection?.close()
  peer?.disconnect()
  peer = null
  serverConnection = null
  clientState.connectionState = ConnectionState.disconnected
  clientState.latestSyncMessageCreatedAt = dayjs.unix(0)

  // restore setting
  bossesExclude.value = settings.bossesExclude
  linesExclude.value = settings.linesExclude
}

function onClickCloseFollowing() {
  clientState.connectionState = ConnectionState.disconnected
  followTableCleanUp()
}

async function onClickAskStopHosting() {
  try {
    await ElMessageBox.confirm(`${t('是否停止分享')}?`, '', {
      type: 'warning'
    })
    onClickCloseHosting()
  } catch (e) {
    console.info(e)
  }
}

async function onClickAskStopFollowing() {
  try {
    await ElMessageBox.confirm(`${t('是否停止跟蹤')}?`, '', {
      type: 'warning'
    })
    onClickCloseFollowing()
  } catch (e) {
    console.info(e)
  }
}

function createSyncMessage(includeExcludes = true) {
  return SyncMessage.create(
    areas,
    includeExcludes ? bossesExclude.value : [],
    includeExcludes ? linesExclude.value : []
  )
}

function send<T>(message: T) {
  for (const conn of connections) {
    if (serverState.connectedPeers[conn.peer]?.connectionState === ConnectionState.connected) {
      conn.send(message)
    }
  }
}

async function sendMonsterTable() {
  if (connections.length) {
    send(await createSyncMessage().toMessagePackZstd())
  }
}

async function receiveMonsterTable(rawData: ArrayBuffer) {
  try {
    if (!(rawData instanceof ArrayBuffer)) {
      throw new MessageError(`receiveMonsterTable rawData type incorrect ${typeof rawData}`)
    }
    const data = await SyncMessage.fromMessagePackZstd(new Uint8Array(rawData))
    if (data.cmd !== SyncMessage.cmd) {
      throw new MessageError(`unknown command ${data.cmd}`)
    }
    if (clientState.latestSyncMessageCreatedAt > data.createdAt) {
      return
    }
    clientState.latestSyncMessageCreatedAt = data.createdAt
    areas = data.payload.areas
    bossesExclude.value = data.payload.bossesExclude
    linesExclude.value = data.payload.linesExclude
    onChangeBossTab()
    forceUpdateTimetable.value = !forceUpdateTimetable.value
  } catch (e) {
    console.error(e)
    ElNotification.error(t('格式錯誤'))
    followTableCleanUp()
  }
}

function onInputId(v: string) {
  settings.id = v.replaceAll(idRemoveInvalidCharactersRegex, '')
}

// bindings
const timetableTabs = reactive({
  areaActiveTab: Object.keys(Area.defaultAreas)[0] as keyof typeof Area.defaultAreas,
  bossActiveTab: '',
  bossActiveLineTab: '1'
})

const dialogs = reactive({
  settingDialogVisible: false,
  hostDialogVisible: false,
  connectDialogVisible: false,
  viewDialogVisible: false
})

const forceUpdateTimetable = ref(false)
const forceUpdateSettingSelectExcludeMenu = ref(false)

const md = new MobileDetect(window.navigator.userAgent)
const isMobileDevice = !!(md.mobile() || md.tablet())
const isMobileSize = ref(window.matchMedia('screen and (max-width: 650px)').matches)
window.addEventListener('resize', () => {
  isMobileSize.value = window.matchMedia('screen and (max-width: 650px)').matches
  forceUpdateSettingSelectExcludeMenu.value = !forceUpdateSettingSelectExcludeMenu.value
})

const bossesExclude = ref(settings.bossesExclude)
const linesExclude = ref(settings.linesExclude)

// areas
type BossInfo = {
  server: Server
  boss: BossEntity
  isDead: boolean
}

const nextLineSuggestServerByBoss = reactive({} as Record<string, BossInfo[]>)
const nextLineSuggestServer = ref([] as BossInfo[])
const recentBossKills = ref([] as BossInfo[])
const recentRespawn = ref([] as BossInfo[])

let areas = [] as Area[]
resetAreas()
function resetAreas() {
  areas = Area.generateAreas(settings.maxServerLine, settings.monsterRespawnTime)
}

let buttonResetTimeoutHandlers = [] as ReturnType<typeof setTimeout>[]
type BossButtonState = Record<string, Record<number, Record<string, boolean>>>
const bossButtonStates = reactive({} as BossButtonState)
onChangeBossTab()

// functions
function bossSetTimeout(area: Area, line: number, boss: BossEntity, ms: number) {
  buttonResetTimeoutHandlers.push(
    setTimeout(() => {
      bossButtonStates[area.name][line][boss.name] = true
      updateBossInfo()

      if (settings.showMonsterRespawnNotification) {
        ElNotification(
          t('respawn_line_notification', {
            line,
            name: t(boss.displayName(settings.showNickName))
          })
        )
      }
      if (settings.soundMonsterRespawnNotification) {
        playAlertTone()
      }
    }, ms)
  )
}

async function toggle(area: Area, line: number, boss: BossEntity) {
  if (clientState.connectionState) {
    ElMessage(t('正在跟隨, 不能修改資料'))
    return
  }

  if (boss.isAlive()) {
    boss.kill()
    bossSetTimeout(area, line, boss, boss.timeUntilRespawnMs())
    bossButtonStates[area.name][line][boss.name] = false
  } else {
    boss.respawn()
    bossButtonStates[area.name][line][boss.name] = true
  }

  updateBossInfo()
  await sendAndSave()
}

function* bossInfoGenerator(now = dayjs()) {
  for (const area of areas) {
    for (const server of area.getServers(linesExclude.value)) {
      for (const boss of server.getBosses(bossesExclude.value)) {
        yield {
          server,
          boss,
          isDead: boss.isDead(now)
        }
      }
    }
  }
}

function updateBossInfo() {
  const now = dayjs()
  const info = Enumerable.from(bossInfoGenerator(now)).toArray()
  updateNextLineSuggestServers(timetableTabs.areaActiveTab, timetableTabs.bossActiveTab, now)
  updateNextLineSuggestServers(timetableTabs.areaActiveTab, '', now)
  updateBossRecentRespawn(info)
  updateRecentBossKills(info)
}

function updateNextLineSuggestServers(mapName: string, bossName = '', now = dayjs()) {
  const info = (function* () {
    for (const server of areas.find((a) => a.name === mapName)?.getServers(linesExclude.value) ??
      []) {
      for (const boss of server.getBosses(bossesExclude.value)) {
        yield {
          server,
          boss,
          isDead: boss.isDead(now)
        }
      }
    }
  })()

  const allBosses = Enumerable.from(info)
    .where((o) => !bossName || o.boss.name === bossName)
    .orderBy((o) => +o.boss.killAt)
    .toArray()
  const suggest = Enumerable.from(allBosses)
    .where((o) => !o.isDead)
    .take(settings.bossInfoCount)
    .toArray()

  if (suggest.length < settings.bossInfoCount) {
    const respawnBoss = Enumerable.from(allBosses)
      .skip(suggest.length)
      .take(settings.bossInfoCount - suggest.length)
    suggest.push(...respawnBoss)
  }

  if (bossName) {
    nextLineSuggestServerByBoss[bossName] = suggest
  } else {
    nextLineSuggestServer.value = suggest
  }
}

function updateBossRecentRespawn(info: BossInfo[]) {
  recentRespawn.value = Enumerable.from(info)
    .where((o) => o.isDead)
    .orderBy((o) => +o.boss.killAt)
    .take(settings.bossInfoCount)
    .toArray()
}

function updateRecentBossKills(info: BossInfo[]) {
  recentBossKills.value = Enumerable.from(info)
    .where((o) => !!+o.boss.killAt)
    .orderByDescending((o) => +o.boss.killAt)
    .take(settings.bossInfoCount)
    .toArray()
}

// view table
type AreaTableRow = {
  area: Area
  server: Server
  boss: BossEntity
  killAt: Date | null
}

const areaTable = reactive({
  currentPage: 1,
  sort: 'killAt',
  order: 'descending',
  pagerCount: 5,
  rows: [] as AreaTableRow[],
  filters: {
    areas: [] as string[],
    lines: [] as number[],
    bosses: [] as string[]
  },
  sortOptions: [
    {
      text: '地圖',
      value: 'area'
    },
    {
      text: '線路',
      value: 'server'
    },
    {
      text: '怪物名字',
      value: 'boss'
    },
    {
      text: '擊殺時間',
      value: 'killAt'
    }
  ]
})

function setViewTableRows() {
  areaTable.rows = areasAsTableWithLimit()
}

function* areasAsTable() {
  for (const area of areas) {
    for (const server of area.servers) {
      for (const boss of server.bosses) {
        yield {
          area,
          server,
          boss,
          killAt: +boss.killAt ? boss.killAt.toDate() : null
        }
      }
    }
  }
}

function areasAsTableWithFilter() {
  const data = Enumerable.from(areasAsTable()).where(
    (row) =>
      (!areaTable.filters.areas.length || areaTable.filters.areas.includes(row.area.name)) &&
      (!areaTable.filters.lines.length || areaTable.filters.lines.includes(row.server.line)) &&
      (!areaTable.filters.bosses.length || areaTable.filters.bosses.includes(row.boss.name))
  )

  const dataOrdered = (() => {
    switch (areaTable.sort) {
      case 'area':
        return data.orderBy((row) => row.area.name)
      case 'server':
        return data.orderBy((row) => row.server.line)
      case 'boss':
        return data.orderBy((row) => row.boss.name)
      default:
        return data.orderBy((row) => +row.boss.killAt)
    }
  })().thenByDescending((row) => row.server.line)

  return areaTable.order === 'ascending' ? dataOrdered.toArray() : dataOrdered.reverse().toArray()
}

function areasAsTableWithLimit() {
  return Enumerable.from(areasAsTableWithFilter())
    .skip((areaTable.currentPage - 1) * settings.areaTable.pageSize)
    .take(settings.areaTable.pageSize)
    .toArray()
}

async function areaTableOnDateChange(boss: BossEntity, date?: Date) {
  boss.killAt = date ? dayjs(date) : dayjs.unix(0)
  onChangeBossTab()
  await sendMonsterTable()
}

function areaTableOnSortChange({ prop, order }: { prop: string; order: string }) {
  areaTable.sort = prop
  areaTable.order = order
  setViewTableRows()
}

// events
function onChangeAreaTab(name?: keyof typeof Area.defaultAreas) {
  name ??= timetableTabs.areaActiveTab
  const area = Enumerable.from(areas).where((area) => area.name === name)

  timetableTabs.bossActiveTab =
    area
      .selectMany((a) =>
        a.servers[0]?.bosses.filter((b) => !bossesExclude.value.includes(b.name)).map((b) => b.name)
      )
      .firstOrDefault() ?? ''

  timetableTabs.bossActiveLineTab =
    area
      .selectMany((area) => area.getServers(linesExclude.value) ?? [])
      .select((server) => server.line.toString())
      .firstOrDefault() ?? ''

  onChangeBossTab()
}

function onChangeBossTab() {
  resetButtonTimeout()
  const now = dayjs()

  for (const area of areas) {
    bossButtonStates[area.name] ??= {}
    for (const server of area.servers) {
      bossButtonStates[area.name][server.line] ??= {}
      for (const boss of server.bosses) {
        const ms = boss.timeUntilRespawnMs(now)
        const isAlive = !ms
        bossButtonStates[area.name][server.line][boss.name] = isAlive
        if (!isAlive) {
          bossSetTimeout(area, server.line, boss, ms)
        }
      }
    }
  }

  updateBossInfo()
}

function resetButtonTimeout() {
  for (const handler of buttonResetTimeoutHandlers) {
    clearTimeout(handler)
  }
  buttonResetTimeoutHandlers = []
}

async function save(showNotification = false) {
  try {
    settings.save.areas = await createSyncMessage().toMessagePackZstdBase64()

    if (showNotification) {
      ElMessage.success(t('成功儲存'))
    }
    return true
  } catch (e) {
    console.error(e)
    ElMessage.error(t('儲存失敗'))
    return false
  }
}

async function loadSave() {
  if (!settings.save.areas) {
    return
  }

  try {
    await importAreas(settings.save.areas, false)
  } catch (e) {
    console.error(e)
    ElNotification.error(t('格式錯誤'))
  }

  await sendMonsterTable()
}

async function sendAndSave() {
  await Promise.all([sendMonsterTable(), settings.autosave ? save() : undefined])
}

async function onClickSave() {
  try {
    await ElMessageBox.confirm(`${t('是否儲存時間表')}?`, '', {
      type: 'warning'
    })
    await save(true)
  } catch (e) {
    console.info(e)
  }
}

async function onClickLoad() {
  if (clientState.connectionState) {
    ElMessage(t('正在跟隨, 不能修改資料'))
    return
  }

  if (!settings.save.areas) {
    ElNotification(t('沒有存檔'))
    return
  }

  try {
    await ElMessageBox.confirm(`${t('是否讀取時間表')}?`, '', {
      type: 'warning'
    })
  } catch (e) {
    console.info(e)
    return
  }

  await loadSave()
}

async function onClickResetMerge() {
  try {
    await ElMessageBox.confirm(`${t('是否以目前時間重置時間表')}?`, '', {
      type: 'warning'
    })

    const {
      payload: { areas: oldAreas }
    } = SyncMessage.fromPlain(createSyncMessage().toPlain())
    resetAreas()

    for (const area of areas) {
      for (const server of area.servers) {
        for (const boss of server.bosses) {
          boss.killAt =
            oldAreas.find((o) => o.name === area.name)?.findBoss(server.line, boss.name)?.killAt ??
            boss.killAt
        }
      }
    }

    onChangeBossTab()
    forceUpdateTimetable.value = !forceUpdateTimetable.value
    ElMessage.success(t('成功'))
  } catch (e) {
    console.info(e)
  }

  await sendAndSave()
}

async function onClickReset() {
  try {
    await ElMessageBox.confirm(`${t('是否重置時間表')}?`, '', {
      type: 'warning'
    })

    resetAreas()
    onChangeBossTab()
    forceUpdateTimetable.value = !forceUpdateTimetable.value
    ElMessage.success(t('成功重置'))
  } catch (e) {
    console.info(e)
  }

  await sendMonsterTable()
}

async function onClickResetSettings() {
  try {
    await ElMessageBox.confirm(`${t('是否重置設定')}?`, '', {
      type: 'warning'
    })
    onClickCloseHosting()
    onClickCloseFollowing()
    settings.resetSettings()
    onLanguageChange()
    onChangeMonsterRespawnTime()
    onChangeBossesExclude()
    onChangeLineExcludeChange()
    ElMessage.success(t('成功重置設定'))
  } catch (e) {
    console.info(e)
  }
}

async function onClickResetSave() {
  try {
    await ElMessageBox.confirm(`${t('是否刪除存檔')}?`, '', {
      type: 'warning'
    })

    settings.deleteSave()
    ElMessage.success(t('成功刪除存檔'))
  } catch (e) {
    console.info(e)
  }
}

function onLinesExcludeVisibleChange(visible: boolean) {
  if (!visible) {
    linesExclude.value.sort((a, b) => a - b)
  }
}

async function onChangeBossesExclude() {
  bossesExclude.value = settings.bossesExclude
  onChangeAreaTab()
  await sendMonsterTable()
}

async function onChangeLineExcludeChange() {
  linesExclude.value = settings.linesExclude
  onChangeAreaTab()
  await sendMonsterTable()
}

async function onChangeMonsterRespawnTime() {
  for (const area of areas) {
    area.setGlobalBossRespawnTime(settings.monsterRespawnTime)
  }
  onChangeBossTab()
  await sendMonsterTable()
}

async function importAreas(base64: string, loadSavedExcludes = settings.loadSavedExcludes) {
  const syncMessage = await SyncMessage.fromMessagePackZstdBase64(base64)
  areas = syncMessage.payload.areas
  if (loadSavedExcludes) {
    settings.bossesExclude = syncMessage.payload.bossesExclude
    settings.linesExclude = syncMessage.payload.linesExclude
    forceUpdateSettingSelectExcludeMenu.value = !forceUpdateSettingSelectExcludeMenu.value
    onChangeBossesExclude()
    onChangeLineExcludeChange()
  }
  onChangeBossTab()
  forceUpdateTimetable.value = !forceUpdateTimetable.value
}

const importLoading = ref(false)
const exportLoading = ref(false)

async function onClickImport() {
  if (!settings.importExportText) {
    return
  }

  if (clientState.connectionState) {
    ElMessage(t('正在跟隨, 不能修改資料'))
    return
  }

  try {
    importLoading.value = true
    await importAreas(settings.importExportText)
    ElMessage.success(t('成功導入'))
  } catch (e) {
    console.error(e)
    ElNotification.error(t('格式錯誤'))
  } finally {
    importLoading.value = false
  }

  await sendMonsterTable()
}

async function onClickExport() {
  try {
    exportLoading.value = true
    settings.importExportText = await createSyncMessage().toMessagePackZstdBase64()
    ElMessage.success(t('成功導出'))
  } catch (e) {
    console.error(e)
  } finally {
    exportLoading.value = false
  }
}

function onClickViewDialogVisible() {
  dialogs.viewDialogVisible = true
}

function onClickHideAllMonster() {
  settings.bossesExclude = Area.getAllBossNames()
  onChangeBossesExclude()
}

function onClickShowAllMonster() {
  settings.bossesExclude = []
  onChangeBossesExclude()
}

function onLanguageChange() {
  locale.value = settings.language
  document.querySelector('html')?.setAttribute('lang', settings.language)
  document.title = t('幻塔怪物時間表')
}

function onOpenSetting() {
  forceUpdateSettingSelectExcludeMenu.value = !forceUpdateSettingSelectExcludeMenu.value
}

let synth: Synth | null
let clearAudioChannelTimeout: ReturnType<typeof setTimeout> | null

function playAlertTone() {
  synth ??= new Synth().toDestination()
  synth.triggerAttackRelease('C4', '8n')

  if (clearAudioChannelTimeout) {
    clearTimeout(clearAudioChannelTimeout)
  }

  clearAudioChannelTimeout = setTimeout(() => {
    synth?.disconnect()
    synth = null
    clearAudioChannelTimeout = null
  }, 3000)
}

onLanguageChange()
onChangeAreaTab()

// load save if autosave is enabled
const globalLoading = ref(false)
if (settings.autosave && settings.save.areas) {
  globalLoading.value = true
  loadSave().then(() => {
    globalLoading.value = false
  })
}
</script>

<template lang="pug">
el-config-provider(:locale="settings.locale")
  el-main(v-loading="globalLoading")
    el-dialog(v-model="dialogs.settingDialogVisible" width="80%" :fullscreen="isMobileSize" @open="onOpenSetting")
      el-tabs
        el-tab-pane(:label="t('一般')" lazy)
          table.setting-table
            tr
              td {{ t("語言") }}
              td
                el-select(v-model="settings.language" @change="onLanguageChange" size="large" style="width: 240px")
                  el-option(v-for="language of supportedLanguages" :key="language.value" :label="language.label" :value="language.value")
            tr
              td {{ t("顯視模式") }}
              td
                el-select(v-model="settings.viewMode" size="large" style="width: 240px")
                  el-option(v-for="[key, label] of Object.entries(viewModes)" :key="key" :label="t(label)" :value="key")
            tr
              td {{ t("深色模式") }}
              td
                el-switch(v-model="settings.darkMode")
            tr
              td {{ t("怪物暱稱") }}
              td
                el-switch(v-model="settings.showNickName")
            tr
              td {{ t("自動儲存 (離線/分享生效)") }}
              td
                el-switch(v-model="settings.autosave")
          el-divider
          table.setting-table
            tr
              td {{ t("用戶連接通知") }}
              td
                el-switch(v-model="settings.showUserConnectNotification")
            tr
              td {{ t("用戶斷開連接通知") }}
              td
                el-switch(v-model="settings.showUserDisconnectNotification")
            tr
              td {{ t("怪物復活通知") }}
              td
                el-switch(v-model="settings.showMonsterRespawnNotification")
            tr
              td {{ t("聲效通知") }}
              td
                el-switch(v-model="settings.soundMonsterRespawnNotification")
                el-button.setting-table__sound-alert-test(@click="playAlertTone" :icon="CaretRight" circle)
          el-divider
          table.setting-table
            tr
              td {{ t("查找表格每頁數量") }}
              td
                el-input-number(v-model="settings.areaTable.pageSize" :min="1" :max="20" :step="1" step-strictly)
          el-divider
          table.setting-table
            tr
              td {{ t("顯示時間表") }}
              td
                el-switch(v-model="settings.showTimetable")
            tr
              td {{ t("顯示線路建議當前怪物") }}
              td
                el-switch(v-model="settings.showBossCurrentTypeSuggestion")
            tr
              td {{ t("顯示線路建議") }}
              td
                el-switch(v-model="settings.showBossSuggestion")
            tr
              td {{ t("顯示怪物復活時間") }}
              td
                el-switch(v-model="settings.showBossInfoRecentRespawn")
            tr
              td {{ t("顯示最近擊殺怪物") }}
              td
                el-switch(v-model="settings.showBossInfoRecentKilled")
            tr
              td {{ t("怪物知訊數量") }}
              td
                el-input-number(v-model="settings.bossInfoCount" :min="1" :max="10" :step="1" @change="updateBossInfo" step-strictly)
            tr
              td {{ t("固定按鈕顏色") }}
              td
                el-color-picker(v-model="settings.bossButtonColor" :predefine="predefineBossColor" size="large")

        el-tab-pane(:label="t('時間表')" name="bossInfo" lazy)
          table.setting-table.setting-timetable-table
            tr
              td {{ t("復活時間") }}
              td
                el-input-number(v-model="settings.monsterRespawnTime" @change="onChangeMonsterRespawnTime" :min="1" :max="3600" :step="1" step-strictly)
                span  {{ t("分鐘") }}
            tr
              td {{ t("隱藏怪物") }}
              td
                template(v-if="isMobileDevice")
                  el-select(v-model="settings.bossesExclude" @change="onChangeBossesExclude" placeholder="" filterable multiple style="width: 100%")
                    el-option(v-for="name of Area.getAllBossNames()" :key="name" :label="t(name)" :value="name")
                template(v-else)
                  el-select(v-model="settings.bossesExclude" @change="onChangeBossesExclude" :key="forceUpdateSettingSelectExcludeMenu" placeholder="" filterable multiple style="width: 100%")
                      el-option(v-for="name of Area.getAllBossNames()" :key="name" :label="t(name)" :value="name")
                el-button(@click="onClickHideAllMonster") {{ t("隱藏所有怪物") }}
                el-button(@click="onClickShowAllMonster" style="margin-left: 0") {{ t("顯示所有怪物") }}
            tr
              td {{ t("隱藏線路") }}
              td
                template(v-if="isMobileDevice")
                  el-select(v-model="settings.linesExclude" @visible-change="onLinesExcludeVisibleChange" @change="onChangeLineExcludeChange" placeholder="" filterable multiple style="width: 100%")
                    el-option(v-for="line of Enumerable.range(1, areas[0].getLargestServerLine())" :key="line" :label="`${line}`" :value="line" )
                template(v-else)
                  el-select(v-model="settings.linesExclude" @visible-change="onLinesExcludeVisibleChange" @change="onChangeLineExcludeChange" placeholder="" :key="forceUpdateSettingSelectExcludeMenu" filterable multiple style="width: 100%")
                      el-option(v-for="line of Enumerable.range(1, areas[0].getLargestServerLine())" :key="line" :label="`${line}`" :value="line" )
          el-divider
          small *{{ t("更改線路上限需要手動重置時間表") }}
          br
          br
          table.setting-table
            tr(v-for="name of Object.keys(Area.defaultAreas)" :key="name")
              td {{ t(name) }}
              td
                el-input-number(v-model="settings.maxServerLine[name]" :min="1" :max="Area.limits.line" :step="1" step-strictly)
                span  {{ t("線") }}
          el-divider
          el-button(@click="onClickResetMerge" type="warning") {{ t("以目前時間重置時間表") }}

        el-tab-pane(:label="t('分享設定')" lazy)
          div(style="display: flex")
            el-input(v-model="settings.id" @input="onInputId" :disabled="hasConnection" :minlength="1" :maxlength="32" :pattern="idValidationPattern")
              template(#prepend) ID
            el-button(@click="settings.resetId" :disabled="hasConnection") {{ t("隨機 ID") }}
          div(style="display: flex")
            el-input(v-model="settings.targetId" @input="onInputId" :disabled="hasConnection" :minlength="1" :maxlength="32" :pattern="idValidationPattern")
              template(#prepend) {{ t("目標 ID") }}

        el-tab-pane(:label="`${t('導入')}/${t('導出')}`" lazy)
          div.setting-row
            el-button(@click="onClickImport") {{ t("導入") }}
            el-button(@click="onClickExport") {{ t("導出") }}
            div(style="float: right")
              span {{ t("包含隱藏怪物線路設定") }}
              el-switch(v-model="settings.loadSavedExcludes" style="margin-left: 12px")
          div.setting-row(v-loading="importLoading || exportLoading")
            el-input(v-model="settings.importExportText" :rows="16" type="textarea")

        el-tab-pane(:label="t('備忘錄')" lazy)
          div.setting-row
            el-input(v-model="settings.memo" :rows="16" type="textarea")

        el-tab-pane(:label="t('重置')" lazy)
          el-button(@click="onClickReset" type="danger") {{ t("重置時間表") }}
          br
          br
          el-button(@click="onClickResetSettings" type="danger") {{ t("重置設定") }}
          br
          br
          el-button(@click="onClickResetSave" type="danger") {{ t("刪除存檔") }}
      template(#footer)
        el-button(@click="dialogs.settingDialogVisible = false") {{ t("關閉") }}

    el-dialog(v-model="dialogs.hostDialogVisible" width="80%" :fullscreen="isMobileSize")
      div
        el-row(:gutter="12")
          el-col(:span="16")
            el-input(v-model="settings.id"  @input="onInputId" :disabled="hasConnection" :minlength="1" :maxlength="32" :pattern="idValidationPattern")
              template(#prepend) ID
          el-col(:span="4")
            el-button(v-if="serverState.connectionState" @click="onClickCloseHosting" type="danger") {{ t("關閉分享") }}
            el-button(v-else @click="onClickHostTable" type="primary") {{ t("開始分享") }}
        br
      div.host-info__user
        h3 {{ t("connection_user_count", { length: Object.keys(serverState.connectedPeers).length }) }}
        div
          el-table(:data="Object.entries(serverState.connectedPeers).map(([id, { connectionState, connectedAt }]) => ({ id, connectionState, connectedAt }))")
            el-table-column(prop="id" label="ID" sortable)
            el-table-column(prop="connectionState" :label="t('連接狀態')" sortable)
              template(#default="scope")
                span(v-if="scope.row.connectionState === ConnectionState.connecting") {{ t("連接中") }}
                span(v-else-if="scope.row.connectionState === ConnectionState.connected") {{ t("已連接") }}
                span(v-else) -
            el-table-column(prop="connectedAt" :label="t('連接時間')" sortable)
              template(#default="scope") {{ Intl.DateTimeFormat(settings.language,  { dateStyle: "long", timeStyle: "medium" }).format(scope.row.connectedAt.toDate()) }}
      template(#footer)
        el-button(@click="dialogs.hostDialogVisible = false") {{ t("關閉") }}

    el-dialog(v-model="dialogs.connectDialogVisible" width="80%" :fullscreen="isMobileSize")
      div
        el-row(:gutter="12")
          el-col(:span="16")
            el-input(v-model="settings.targetId" @input="onInputId" :disabled="hasConnection" :minlength="1" :maxlength="32" :pattern="idValidationPattern")
              template(#prepend) {{ t("目標 ID") }}
          el-col(:span="4")
            el-button(v-if="clientState.connectionState" @click="onClickCloseFollowing" type="danger") {{ t("取消跟蹤") }}
            el-button(v-else @click="onClickFollowTable" type="warning") {{ t("開始跟蹤") }}
      template(#footer)
        el-button(@click="dialogs.connectDialogVisible = false") {{ t("關閉") }}

    el-dialog(v-model="dialogs.viewDialogVisible" width="80%" @open="setViewTableRows" :fullscreen="isMobileSize")
      div.view-table-filters
        div
          div {{ t("地圖") }}
          div
            el-select(v-model="areaTable.filters.areas" placeholder=" " @change="setViewTableRows" filterable multiple)
              el-option(v-for="name of Object.keys(Area.defaultAreas)" :key="name" :label="t(name)" :value="name")
        div
          div {{ t("線路") }}
          div
            el-select(v-model="areaTable.filters.lines" placeholder=" " @change="setViewTableRows" filterable multiple)
              el-option(v-for="name of Enumerable.range(1, areas[0].getLargestServerLine())" :key="name" :label="name" :value="name")
        div
          div {{ t("怪物名字") }}
          div
            el-select(v-model="areaTable.filters.bosses" placeholder=" " @change="setViewTableRows" filterable multiple)
              el-option(v-for="name of Area.getAllBossNames()" :key="name" :label="t(name)" :value="name")
        div
          div {{ t("排序") }}
          div
            el-select(v-model="areaTable.sort" placeholder=" " @change="setViewTableRows" filterable style="width: 150px")
              el-option(v-for="o of areaTable.sortOptions" :key="o.value" :label="t(o.text)" :value="o.value")
      br
      div.view-table-mobile__rows(v-if="isMobileSize")
        div(v-for="row of areaTable.rows" :key="`${row.area.name}${row.server.line}${row.boss.name}`")
          el-card
            template(#header) 【{{ t(row.area.name) }}】 {{ row.server.line }}
            div.view-table-mobile__row-card-container
              div {{ t(row.boss.displayName(settings.showNickName)) }}
              div.view-table-mobile__time-edit-container
                el-date-picker(type="datetime" v-model="row.killAt" @change="areaTableOnDateChange(row.boss, $event)" :disabled="!!clientState.connectionState")
      el-table(v-else :data="areaTable.rows" table-layout="auto" @sort-change="areaTableOnSortChange")
        el-table-column(prop="area" :label="t('地圖')" sortable)
          template(#default="scope") {{ t(scope.row.area.name) }}
        el-table-column(prop="server" :label="t('線路')" sortable)
          template(#default="scope") {{ scope.row.server.line }}
        el-table-column(prop="boss" :label="t('怪物名字')" sortable)
          template(#default="scope") {{ t(scope.row.boss.displayName(settings.showNickName)) }}
        el-table-column(prop="killAt" :label="t('擊殺時間')" sortable)
          template(#default="scope") {{ +scope.row.boss.killAt ? scope.row.boss.killAt.format('HH:mm:ss') : '-' }}
        el-table-column(:label="t('修改時間')")
          template(#default="scope")
            el-date-picker(type="datetime" v-model="scope.row.killAt" @change="areaTableOnDateChange(scope.row.boss, $event)" :disabled="!!clientState.connectionState")
      br
      el-pagination(layout="prev, pager, next" v-model:current-page="areaTable.currentPage" :page-size="settings.areaTable.pageSize" :total="areasAsTableWithFilter().length" :pager-count="areaTable.pagerCount" @current-change="setViewTableRows" background)
      template(#footer)
        el-button(@click="dialogs.viewDialogVisible = false") {{ t("關閉") }}

    div.action-menu
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover" :disabled="isMobileDevice")
        div {{ t("設定") }}
        template(#reference)
          el-button(@click="dialogs.settingDialogVisible = true" :icon="Setting" type="primary" :title="t('設定')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover" :disabled="isMobileDevice")
        div {{ t("存檔") }}
        template(#reference)
          el-button(@click="onClickSave" type="success" :icon="DocumentAdd" :title="t('存檔')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover" :disabled="isMobileDevice")
        div {{ t("讀取") }}
        template(#reference)
          el-button(@click="onClickLoad" type="warning" :icon="Reading" :title="t('讀取')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover" :disabled="isMobileDevice")
        div {{ t("查看") }}
        template(#reference)
          el-button(@click="onClickViewDialogVisible" type="primary" :icon="Search" :title="t('查看')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover" :disabled="isMobileDevice")
        div {{ t("開場") }}
        template(#reference)
          el-button(@click="dialogs.hostDialogVisible = true" type="success" :icon="Share" :title="t('開場')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover" :disabled="isMobileDevice")
        div {{ t("進場") }}
        template(#reference)
          el-button(@click="dialogs.connectDialogVisible = true" :icon="View" type="primary" :title="t('進場')")
      div.settings_menu-icon(v-if="serverState.connectionState" @click="onClickAskStopHosting" style="cursor: pointer")
        el-tooltip(:content="t('允許同步')" placement="top-start")
          el-icon
            Share
      div.settings_menu-icon(v-if="clientState.connectionState === ConnectionState.connected" @click="onClickAskStopFollowing" style="cursor: pointer")
        el-tooltip(:content="t('正在跟蹤')" placement="top-start")
          el-icon
            View
      span.setting_menu__id(v-if="serverState.connectionState") {{ settings.id }}
      span.setting_menu__id(v-if="clientState.connectionState === ConnectionState.connected") {{ settings.targetId }}
    br
    div(v-if="settings.showTimetable")
      el-tabs(v-model="timetableTabs.areaActiveTab" @tab-change="onChangeAreaTab" :key="forceUpdateTimetable" type="border-card")
        el-tab-pane(v-for="area of areas" :label="t(area.name)" :name="area.name" :key="area.name" lazy)

          el-tabs.monster-trace-tab(v-if="settings.viewMode === 'byLine'" v-model="timetableTabs.bossActiveLineTab" @tab-change="onChangeBossTab" type="border-card")
            el-tab-pane(v-for="server of area.getServers(linesExclude)" :label="`${server.line}`" :name="`${server.line}`" :key="server.line" lazy)
              div.monster-trace__container
                div.monster-trace__button-container(v-for="boss in server.getBosses(bossesExclude)" :key="boss.name")
                  el-button.monster-trace__button.monster-trace__button--name(v-if="bossButtonStates[area.name][server.line][boss.name]" @click="toggle(area, server.line, boss)" :color="settings.bossButtonColor || boss.color") {{ t(boss.displayName(settings.showNickName)) }}
                  template(v-else)
                    el-popconfirm(:title="`${t('確認復活怪物')}?`" @confirm="toggle(area, server.line, boss)" width="auto")
                      template(#reference)
                        el-button.monster-trace__button.monster-trace__button--name(type="danger") {{ t(boss.displayName(settings.showNickName)) }}

          el-tabs.monster-trace-tab(v-else-if="settings.viewMode === 'byBoss'" v-model="timetableTabs.bossActiveTab" @tab-change="onChangeBossTab" type="border-card")
            el-tab-pane(v-for="_boss of area.servers[0].getBosses(bossesExclude)" :label="t(_boss.displayName(settings.showNickName))" :name="_boss.name" :key="_boss.name" lazy)
              div.monster-trace__container
                div.monster-trace__button-container(v-for="line in Enumerable.from(area.getServers(linesExclude)).select((s) => s.line)" :key="line")
                  template(v-for="boss of [area.findBoss(line, _boss.name)]" :key="boss.name")
                    el-button.monster-trace__button(v-if="bossButtonStates[area.name][line][boss.name]" @click="toggle(area, line, boss)" :color="settings.bossButtonColor || boss.color") {{ line }}
                    template(v-else)
                      el-popconfirm(:title="`${t('確認復活怪物')}?`" @confirm="toggle(area, line, boss)" width="auto")
                        template(#reference)
                          el-button.monster-trace__button(type="danger") {{ line }}
      br
    div.boss-info-container
      div(v-if="settings.viewMode === 'byBoss' && settings.showBossCurrentTypeSuggestion")
        el-card
          template(#header)
            span.boss-info__header {{ t("線路建議 (當前怪物)") }}
          el-row(v-for="(info, i) of nextLineSuggestServerByBoss[timetableTabs.bossActiveTab]" :key="i" :class="{'boss-info-container__info--dead': info.boss.isDead()}")
            el-col
              span(v-if="settings.language.startsWith('en')")
                span {{ t("線") }}
                span.next-server-suggest__line-text {{ info.server.line }}
                span {{ t(info.boss.displayName(settings.showNickName)) }}
              span(v-else)
                span.next-server-suggest__line-text {{ info.server.line }}
                span {{ t("線") }}
                span  / {{ t(info.boss.displayName(settings.showNickName)) }}
              span(v-if="info.boss.isDead()")  / {{ info.boss.respawnAt.format('HH:mm:ss') }}
      div(v-if="settings.showBossSuggestion")
        el-card
          template(#header)
            span.boss-info__header {{ t("線路建議") }}
          el-row(v-for="(info, i) of nextLineSuggestServer" :key="i" :class="{'boss-info-container__info--dead': info.boss.isDead()}")
            el-col
              span(v-if="settings.language.startsWith('en')")
                span {{ t("線") }}
                span.next-server-suggest__line-text {{ info.server.line }}
                span {{ t(info.boss.displayName(settings.showNickName)) }}
              span(v-else)
                span.next-server-suggest__line-text {{ info.server.line }}
                span {{ t("線") }}
                span  / {{ t(info.boss.displayName(settings.showNickName)) }}
              span(v-if="info.boss.isDead()")  / {{ info.boss.respawnAt.format('HH:mm:ss') }}
      div(v-if="settings.showBossInfoRecentRespawn")
        el-card.recent-boss-kill
          template(#header)
            span.boss-info__header {{ t("怪物復活時間") }}
          el-row(v-for="(info, i) of recentRespawn" :key="i")
            el-col
              span(v-if="settings.language.startsWith('en')")
                span {{ t("線") }}
                span.next-server-suggest__line-text {{ info.server.line }}
                span {{ t(info.boss.displayName(settings.showNickName)) }}
              span(v-else)
                span.next-server-suggest__line-text {{ info.server.line }}
                span {{ t("線") }}
                span  / {{ t(info.boss.displayName(settings.showNickName)) }}
              span(v-if="info.boss.isDead()")  / {{ info.boss.respawnAt.format('HH:mm:ss') }}
      div(v-if="settings.showBossInfoRecentKilled")
        el-card.recent-boss-kill
          template(#header)
            span.boss-info__header {{ t("最近死亡怪物") }}
          el-row(v-for="(info, i) of recentBossKills" :key="i")
            el-col
              span(v-if="settings.language.startsWith('en')")
                span {{ t("線") }}
                span.next-server-suggest__line-text {{ info.server.line }}
                span / {{ t(info.boss.displayName(settings.showNickName)) }} / {{ info.boss.killAt.format('HH:mm:ss') }}
              span(v-else)
                span.next-server-suggest__line-text {{ info.server.line }}
                span  {{ t("線") }} / {{ t(info.boss.displayName(settings.showNickName)) }} / {{ info.boss.killAt.format('HH:mm:ss') }}
</template>

<style lang="sass">
.setting-row
  margin-bottom: 12px

.setting-table
  td:nth-child(odd)
    white-space: nowrap
  td:nth-child(even)
    padding-left: 6px
    display: flex
    align-items: center
  td > span
    margin-left: 4px

.setting-timetable-table
  width: 100%
  td:nth-child(odd)
    width: 0
.setting-table__sound-alert-test
  margin-left: 12px

.action-menu
  display: flex
  align-items: center

.action-menu__buttons-popover
  min-width: auto !important
  width: auto !important

.settings_menu-icon
  margin-left: 12px
  display: flex
  align-items: center

.setting_menu__id
  margin-left: 12px
  text-overflow: ellipsis
  overflow: hidden !important
  white-space: nowrap

.view-table-filters
  display: flex
  flex-direction: row
  flex-wrap: wrap
  gap: 12px
  justify-content: right
  margin-bottom: 6px
  > div
    display: flex
    align-items: center
    > div:nth-child(odd)
        margin-right: 6px

.view-table-mobile__rows
  display: flex
  flex-direction: column
  row-gap: 12px

.view-table-mobile__row-card-container
  display: flex
  flex-grow: column
  align-items: center
  .view-table-mobile__time-edit-container
    margin-left: auto

.monster-trace-tab
  margin: -15px

.monster-trace__container
  display: grid
  width: 1200px
  grid-template-columns: repeat(20, 1fr)
  gap: 12px
  @media screen and (max-width: 1280px)
    width: 600px
    grid-template-columns: repeat(10, 1fr)
  @media screen and (max-width: 670px)
    width: 100%
    display: flex
    flex-wrap: wrap

.monster-trace__button
  width: 50px
  height: 40px
.monster-trace__button--name
  width: auto
  margin-left: 12px

.boss-info__header
  font-weight: bold

.next-server-suggest__line-text
  padding-left: 6px
  padding-right: 6px
  font-size: 30px

.boss-info-container
  display: flex
  flex-direction: row
  flex-wrap: wrap
  gap: 24px
  align-items: stretch
  .el-card
    min-height: 100%
  @media screen and (max-width: 650px)
    > div
      width: 100%
    .el-card
      width: 100%
.boss-info-container__info--dead
  color: gray
</style>
