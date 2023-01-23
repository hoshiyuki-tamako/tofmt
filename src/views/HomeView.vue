<script setup lang="ts">
import { reactive, ref } from "vue";
import Enumerable from "linq";
import type Server from "@/logic/Server";
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { useSettings, viewModes, supportedLanguages } from "@/stores/settings";
import dayjs from "dayjs";
import type BossEntity from "@/logic/BossEntity";
import Area from "@/logic/Area";
import { plainToInstance } from "class-transformer";
import { transformAndValidate } from "class-transformer-validator";
import MobileDetect from "mobile-detect";
import SyncMessage from "@/logic/network/SyncMessage";
import MessageError from "@/exceptions/MessageError";
import {
  Setting,
  Share,
  View,
  Search,
  DocumentAdd,
  Reading,
} from "@element-plus/icons-vue";
import { Packr } from "msgpackr";
import { encode, decode } from "base64-arraybuffer";
import { ZstdCodec } from "zstd-codec";
import { useI18n } from "vue-i18n";

// stores
const settings = useSettings();
const { t, locale } = useI18n();

const url = new URL(window.location.toString());
const urlLocale = url.searchParams.get("locale");
if (urlLocale && supportedLanguages.find(({ value }) => value === urlLocale)) {
  settings.language = urlLocale;
}

// others
const md = new MobileDetect(window.navigator.userAgent);
const packr = new Packr();

// servers
type ConnectedPeerInfo = {
  connectionState: ConnectionState;
  connectedAt: dayjs.Dayjs;
};

enum ConnectionState {
  disconnected,
  connecting,
  connected,
}

const connectionPrefix = "tofmt";
let peer: Peer | null;
let connections = [] as DataConnection[];
const serverState = reactive({
  id: "",
  connectionState: ConnectionState.disconnected,
  connectedPeers: {} as Record<string, ConnectedPeerInfo>,
});

// client
let serverConnection: DataConnection | null;
const clientState = reactive({
  connectionState: ConnectionState.disconnected,
});

// peer
function getPeerId(id: string) {
  return `${connectionPrefix}-${id}`;
}

// server functions
function onServerError(e: Error) {
  ElNotification.error({
    message: e.message,
    duration: 0,
  });
}

function onClickHostTable() {
  hostServerCleanUp();
  onClickCloseFollowing();

  if (!settings.id) {
    ElNotification.error({
      message: t("ID 不能為空"),
      duration: 0,
    });
    return;
  }

  ElMessage(`${t("正在啟動分享")} ${settings.id}`);
  serverState.connectionState = ConnectionState.connecting;

  peer = new Peer(getPeerId(settings.id));
  peer.on("open", () => {
    serverState.connectionState = ConnectionState.connected;
    dialogs.hostDialogVisible = false;
    ElMessage.success(t("已允許同步"));
  });
  peer.on("error", (err) => {
    ElMessage.error(err.message);
  });
  peer.on("connection", (conn) => {
    connections.push(conn);
    serverState.connectedPeers[conn.peer] = {
      connectionState: ConnectionState.connecting,
      connectedAt: dayjs(),
    };
    conn.on("open", () => {
      if (serverState.connectedPeers[conn.peer]) {
        serverState.connectedPeers[conn.peer].connectionState =
          ConnectionState.connected;
      }
      if (settings.showUserConnectNotification) {
        ElMessage(t("user_connect", { id: conn.peer }));
      }
      sendMonsterTable();
    });
    conn.on("close", () => {
      connections = Enumerable.from(connections)
        .where((c) => c !== conn)
        .toArray();
      delete serverState.connectedPeers[conn.peer];
      if (settings.showUserDisconnectNotification) {
        ElMessage(t("user_disconnect", { id: conn.peer }));
      }
    });
    conn.on("error", onServerError);
  });
  peer.on("disconnected", () => {
    hostServerCleanUp();
  });
  peer.on("error", onServerError);
}

function hostServerCleanUp() {
  for (const connection of connections) {
    connection.close();
  }
  connections = [];
  peer?.disconnect();
  peer = null;
  serverState.connectionState = ConnectionState.disconnected;
  serverState.connectedPeers = {};
}

function onClickCloseHosting() {
  hostServerCleanUp();
}

function onClickFollowTable() {
  if (!settings.id) {
    ElNotification.error({
      message: t("目標 ID 不能為空"),
      duration: 0,
    });
    return;
  }
  onClickCloseFollowing();
  onClickCloseHosting();

  ElMessage(`${t("正在連接到")} ${settings.targetId}`);
  clientState.connectionState = ConnectionState.connecting;

  peer = new Peer(getPeerId(settings.id));
  peer.on("open", () => {
    serverConnection = peer?.connect(getPeerId(settings.targetId)) || null;
    serverConnection?.on("open", () => {
      dialogs.connectDialogVisible = false;
      clientState.connectionState = ConnectionState.connected;
      ElMessage.success(t("已跟蹤"));
    });
    serverConnection?.on("data", (data) => {
      receiveMonsterTable(data as Partial<SyncMessage>);
    });
    serverConnection?.on("close", () => {
      if (clientState.connectionState) {
        onServerError(new Error(t("跟蹤連接已斷開")));
      }
      onClickCloseFollowing();
    });
  });
  peer.on("disconnected", () => {
    followTableCleanUp();
    ElMessage(t("已停止跟蹤"));
  });
  peer.on("error", onServerError);
}

function followTableCleanUp() {
  serverConnection?.close();
  peer?.disconnect();
  peer = null;
  clientState.connectionState = ConnectionState.disconnected;
  serverConnection = null;

  // restore setting
  bossesExclude.value = settings.bossesExclude;
  linesExclude.value = settings.linesExclude;
}

function onClickCloseFollowing() {
  clientState.connectionState = ConnectionState.disconnected;
  followTableCleanUp();
}

async function onClickAskStopHosting() {
  try {
    await ElMessageBox.confirm(`${t("是否停止分享")}?`, "", {
      type: "warning",
    });
    onClickCloseHosting();
  } catch (e) {
    console.info(e);
  }
}

async function onClickAskStopFollowing() {
  try {
    await ElMessageBox.confirm(`${t("是否停止跟蹤")}?`, "", {
      type: "warning",
    });
    onClickCloseFollowing();
  } catch (e) {
    console.info(e);
  }
}

function sendMonsterTable() {
  const message = SyncMessage.create(
    areas,
    bossesExclude.value,
    linesExclude.value
  );

  for (const conn of connections) {
    if (
      serverState.connectedPeers[conn.peer]?.connectionState ===
      ConnectionState.connected
    ) {
      conn.send(message);
    }
  }
}

function clearAllState() {
  for (const area of areas) {
    area.clearCache();
  }
  forceUpdateTimetable.value = !forceUpdateTimetable.value;
}

async function receiveMonsterTable(rawData: Partial<SyncMessage>) {
  try {
    const data = await transformAndValidate(SyncMessage, rawData);
    if (data.cmd !== "tofmt/sync") {
      throw new MessageError(`unknown command ${data.cmd}`);
    }
    // TODO class transformer bug/issue
    areas = data.payload.areas.map((m) => plainToInstance(Area, m));
    bossesExclude.value = data.payload.bossesExclude;
    linesExclude.value = data.payload.linesExclude;
    clearAllState();
    onChangeBossTab();
  } catch (e) {
    if (e instanceof MessageError) {
      console.error(e);
    } else {
      console.error("receive data structure error", e);
    }

    ElNotification.error(t("格式錯誤"));
    followTableCleanUp();
  }
}

// binding
const timetableTabs = reactive({
  areaActiveTab: Object.keys(
    Area.defaultAreas
  )[0] as keyof typeof Area.defaultAreas,
  bossActiveTab: "",
  bossActiveLineTab: "1",
});

const dialogs = reactive({
  settingDialogVisible: false,
  hostDialogVisible: false,
  connectDialogVisible: false,
  viewDialogVisible: false,
});

const forceUpdateTimetable = ref(false);

const bossesExclude = ref(settings.bossesExclude as string[]);
const linesExclude = ref(settings.linesExclude as number[]);

type BossInfo = {
  server: Server;
  boss: BossEntity;
};

const nextLineSuggestServerByBoss = reactive({} as Record<string, BossInfo[]>);
const nextLineSuggestServer = ref([] as BossInfo[]);
const recentBossKills = ref([] as BossInfo[]);

let areas = [] as Area[];
resetAreas();
function resetAreas() {
  areas = Area.generateAreas(
    settings.maxServerLine,
    settings.monsterRespawnTime
  );
}

let buttonResetTimeoutHandlers = [] as number[];
type BossButtonState = Record<string, Record<number, Record<string, boolean>>>;
const bossButtonStates = reactive({} as BossButtonState);
onChangeBossTab();

// functions
function bossSetTimeout(
  area: Area,
  line: number,
  boss: BossEntity,
  ms: number
) {
  buttonResetTimeoutHandlers.push(
    setTimeout(() => {
      bossButtonStates[area.name][line][boss.name] = true;
      if (settings.showMonsterRespawnNotification) {
        ElNotification(
          t("respawn_line_notification", {
            line,
            name: t(boss.displayName(settings.showNickName)),
          })
        );
      }
      updateBossInfo();
    }, ms)
  );
}

async function toggle(area: Area, line: number, boss: BossEntity) {
  if (clientState.connectionState) {
    ElMessage(t("正在跟隨, 不能修改資料"));
    return;
  }

  if (boss.isAlive()) {
    boss.kill();
    bossSetTimeout(area, line, boss, boss.timeUntilRespawnMs());
    bossButtonStates[area.name][line][boss.name] = false;
  } else {
    boss.respawn();
    bossButtonStates[area.name][line][boss.name] = true;
  }

  updateBossInfo();
  sendMonsterTable();

  if (settings.autosave) {
    await save();
  }
}

function updateBossInfo() {
  updateNextLineSuggestServers(
    timetableTabs.areaActiveTab,
    timetableTabs.bossActiveTab
  );
  updateNextLineSuggestServers(timetableTabs.areaActiveTab);
  updateRecentBossKills();
}

function updateNextLineSuggestServers(mapName: string, bossName = "") {
  const info = [] as BossInfo[];

  for (const server of areas
    .find((a) => a.name === mapName)
    ?.getServers(linesExclude.value) ?? []) {
    for (const boss of server.getBosses(bossesExclude.value)) {
      if (!boss.isAlive() || (bossName && boss.name !== bossName)) {
        continue;
      }

      info.push({
        server,
        boss,
      });
    }
  }

  const suggest = Enumerable.from(info)
    .orderBy((o) => o.boss.killAt.unix())
    .take(settings.bossInfoCount)
    .toArray();

  if (bossName) {
    nextLineSuggestServerByBoss[bossName] = suggest;
  } else {
    nextLineSuggestServer.value = suggest;
  }
}

function updateRecentBossKills() {
  const info = [] as BossInfo[];

  for (const area of areas) {
    for (const server of area.getServers(linesExclude.value)) {
      for (const boss of server.getBosses(bossesExclude.value)) {
        if (!boss.killAt.unix()) {
          continue;
        }

        info.push({
          server,
          boss,
        });
      }
    }
  }

  recentBossKills.value = Enumerable.from(info)
    .orderByDescending((o) => o.boss.killAt.unix())
    .take(settings.bossInfoCount)
    .toArray();
}

// view table
type AreaTableRow = {
  area: Area;
  server: Server;
  boss: BossEntity;
  killAt: Date;
};

const areaTable = reactive({
  currentPage: 1,
  sort: "",
  order: "ascending",
  filters: {
    areas: [] as string[],
    lines: [] as number[],
    bosses: [] as string[],
  },
});

function areasAsTable() {
  const rows = [] as AreaTableRow[];

  for (const area of areas) {
    for (const server of area.servers) {
      for (const boss of server.bosses) {
        rows.push({
          area,
          server,
          boss,
          killAt: boss.killAt.toDate(),
        });
      }
    }
  }

  return rows;
}

function areasAsTableWithFilter() {
  let data = Enumerable.from(areasAsTable()).where(
    (row) =>
      (!areaTable.filters.areas.length ||
        areaTable.filters.areas.includes(row.area.name)) &&
      (!areaTable.filters.lines.length ||
        areaTable.filters.lines.includes(row.server.line)) &&
      (!areaTable.filters.bosses.length ||
        areaTable.filters.bosses.includes(row.boss.name))
  );

  switch (areaTable.sort) {
    case "area":
      data = data.orderBy((row) => row.area.name);
      break;
    case "server":
      data = data.orderBy((row) => row.server.line);
      break;
    case "boss":
      data = data.orderBy((row) => row.boss.name);
      break;
    default:
      data = data.orderBy((row) => row.boss.killAt.unix());
  }

  if (areaTable.order !== "ascending") {
    data = data.reverse();
  }
  return data.toArray();
}

function areasAsTableWithLimit() {
  return Enumerable.from(areasAsTableWithFilter())
    .skip((areaTable.currentPage - 1) * settings.areaTable.pageSize)
    .take(settings.areaTable.pageSize)
    .toArray();
}

function areaTableOnDateChange(boss: BossEntity, date: Date) {
  boss.killAt = dayjs(date);
  onChangeBossTab();
  sendMonsterTable();
}

function areaTableOnSortChange({
  prop,
  order,
}: {
  prop: string;
  order: string;
}) {
  areaTable.sort = prop;
  areaTable.order = order;
}

// events
function onChangeAreaTab(name?: keyof typeof Area.defaultAreas) {
  name ??= timetableTabs.areaActiveTab;
  const area = Enumerable.from(areas).where((area) => area.name === name);

  timetableTabs.bossActiveTab =
    area
      .selectMany((a) =>
        a.servers[0]?.bosses
          .filter((b) => !bossesExclude.value.includes(b.name))
          .map((b) => b.name)
      )
      .firstOrDefault() ?? "";

  timetableTabs.bossActiveLineTab =
    area
      .selectMany((area) => area.getServers(linesExclude.value) ?? [])
      .select((server) => server.line.toString())
      .firstOrDefault() ?? "";

  onChangeBossTab();
}

function onChangeBossTab() {
  resetButtonTimeout();

  for (const area of areas) {
    bossButtonStates[area.name] ??= {};
    for (const server of area.servers) {
      bossButtonStates[area.name][server.line] ??= {};
      for (const boss of server.bosses) {
        const ms = boss.timeUntilRespawnMs();
        const isAlive = !ms;
        bossButtonStates[area.name][server.line][boss.name] = isAlive;
        if (!isAlive) {
          bossSetTimeout(area, server.line, boss, ms);
        }
      }
    }
  }

  updateBossInfo();
}

function resetButtonTimeout() {
  for (const handler of buttonResetTimeoutHandlers) {
    clearTimeout(handler);
  }
  buttonResetTimeoutHandlers = [];
}

async function save(showNotification = false) {
  try {
    settings.save.areas = await exportAreas();
    if (showNotification) {
      ElMessage.success(t("成功儲存"));
    }
    return true;
  } catch (e) {
    console.error(e);
    ElMessage.success(t("儲存失敗"));
    return false;
  }
}

async function onClickSave() {
  try {
    await ElMessageBox.confirm(`${t("是否儲存時間表")}?`, "", {
      type: "warning",
    });
    await save(true);
  } catch (e) {
    console.info(e);
  }
}

async function onClickLoad() {
  if (clientState.connectionState) {
    ElMessage(t("正在跟隨, 不能修改資料"));
    return;
  }

  if (!settings.save.areas) {
    ElNotification(t("沒有存檔"));
    return;
  }

  try {
    await ElMessageBox.confirm(`${t("是否讀取時間表")}?`, "", {
      type: "warning",
    });
  } catch (e) {
    console.info(e);
    return;
  }

  try {
    areas = await importAreas(settings.save.areas);
    clearAllState();
    onChangeBossTab();
    sendMonsterTable();
    ElMessage.success(t("成功讀取"));
  } catch (e) {
    console.error(e);
    ElNotification.error(t("格式錯誤"));
  }
}

async function onClickResetMerge() {
  try {
    await ElMessageBox.confirm(`${t("是否以目前時間重置時間表")}?`, "", {
      type: "warning",
    });

    const oldAreas = await importAreas(await exportAreas());
    resetAreas();

    for (const area of areas) {
      for (const server of area.servers) {
        for (const boss of server.bosses) {
          boss.killAt =
            oldAreas
              .find((o) => o.name === area.name)
              ?.findBoss(server.line, boss.name)?.killAt ?? boss.killAt;
        }
      }
    }

    onChangeBossTab();
    sendMonsterTable();
    forceUpdateTimetable.value = !forceUpdateTimetable.value;
    ElMessage.success(t("成功"));
  } catch (e) {
    console.info(e);
  }
}

async function onClickReset() {
  try {
    await ElMessageBox.confirm(`${t("是否重置時間表")}?`, "", {
      type: "warning",
    });

    resetAreas();
    onChangeBossTab();
    sendMonsterTable();
    forceUpdateTimetable.value = !forceUpdateTimetable.value;
    ElMessage.success(t("成功重置"));
  } catch (e) {
    console.info(e);
  }
}

async function onClickResetSettings() {
  try {
    await ElMessageBox.confirm(`${t("是否重置設定")}?`, "", {
      type: "warning",
    });
    settings.resetSettings();
    onClickCloseHosting();
    onClickCloseFollowing();
    ElMessage.success(t("成功重置設定"));
  } catch (e) {
    console.info(e);
  }
}

async function onClickResetSave() {
  try {
    await ElMessageBox.confirm(`${t("是否刪除存檔")}?`, "", {
      type: "warning",
    });

    settings.deleteSave();
    ElMessage.success(t("成功刪除存檔"));
  } catch (e) {
    console.info(e);
  }
}

function onLinesExcludeVisibleChange(visible: boolean) {
  if (!visible) {
    linesExclude.value.sort((a, b) => a - b);
  }
}

function onChangeBossesExclude() {
  bossesExclude.value = settings.bossesExclude;
  onChangeAreaTab();
  sendMonsterTable();
}

function onChangeMonsterRespawnTime() {
  for (const area of areas) {
    area.setGlobalBossRespawnTime(settings.monsterRespawnTime);
  }
  onChangeBossTab();
  sendMonsterTable();
}

function onChangeLineExcludeChange() {
  linesExclude.value = settings.linesExclude;
  onChangeAreaTab();
  sendMonsterTable();
}

async function importAreas(base64Data: string) {
  const simple = await new Promise((resolve) => {
    ZstdCodec.run(({ Simple }) => {
      resolve(new Simple());
    });
  });
  const rawData = packr.unpack(
    simple.decompress(new Uint8Array(decode(base64Data.trim())))
  );
  const data = await transformAndValidate(
    SyncMessage,
    rawData as Partial<SyncMessage>
  );
  // TODO class transformer bug/issue
  return data.payload.areas.map((m) => plainToInstance(Area, m));
}

function exportAreas(): Promise<string> {
  return new Promise((resolve, reject) => {
    ZstdCodec.run(({ Simple }) => {
      try {
        const simple = new Simple();
        const compressed = simple.compress(
          packr.pack(SyncMessage.create(areas)),
          22
        );
        resolve(encode(compressed));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function onClickImport() {
  if (!settings.importExportText) {
    return;
  }

  if (clientState.connectionState) {
    ElMessage(t("正在跟隨, 不能修改資料"));
    return;
  }

  try {
    areas = await importAreas(settings.importExportText);
    clearAllState();
    onChangeBossTab();
    sendMonsterTable();
    ElMessage.success(t("成功導入"));
  } catch (e) {
    console.error(e);
    ElNotification.error(t("格式錯誤"));
  }
}

async function onClickExport() {
  settings.importExportText = await exportAreas();
  ElMessage.success(t("成功導出"));
}

function onClickViewDialogVisible() {
  dialogs.viewDialogVisible = true;
}

function onClickHideAllMonster() {
  settings.bossesExclude = Area.getAllBossNames();
  onChangeBossesExclude();
}

function onClickShowAllMonster() {
  settings.bossesExclude = [];
  onChangeBossesExclude();
}

function onLanguageChange() {
  locale.value = settings.language;
  document.querySelector("html")?.setAttribute("lang", settings.language);
  document.title = t("幻塔怪物時間表");
}

onLanguageChange();
onChangeAreaTab();
</script>

<template lang="pug">
el-config-provider(:locale="settings.locale")
  main.main
    el-dialog(v-model="dialogs.settingDialogVisible" width="80%" :fullscreen="!!(md.mobile() || md.tablet())")
      el-tabs(lazy)
        el-tab-pane(:label="t('界面')")
          table.setting-table
            tr
              td {{ t("語言") }}
              td
                el-select(v-model="settings.language" @change="onLanguageChange" size="large")
                  el-option(v-for="language of supportedLanguages" :key="language.value" :label="language.label" :value="language.value")
            tr
              td {{ t("顯視模式") }}
              td
                el-select(v-model="settings.viewMode" size="large")
                  el-option(v-for="[key, label] of Object.entries(viewModes)" :key="key" :label="t(label)" :value="key")
            tr
              td {{ t("深色模式") }}
              td
                el-switch(v-model="settings.darkMode")
            tr
              td {{ t("怪物暱稱") }}
              td
                el-switch(v-model="settings.showNickName")
          el-divider
          table
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
          el-divider
          table
            tr
              td {{ t("查找表格每頁數量") }}
              td
                el-input-number(v-model="settings.areaTable.pageSize" :min="1" :max="10" :step="1" step-strictly)
          el-divider
          table
            tr
              td {{ t("顯示線路建議當前怪物") }}
              td
                el-switch(v-model="settings.showBossCurrentTypeSuggestion")
            tr
              td {{ t("顯示線路建議") }}
              td
                el-switch(v-model="settings.showBossSuggestion")
            tr
              td {{ t("顯示最近擊殺怪物") }}
              td
                el-switch(v-model="settings.showBossInfoRecentKilled")
            tr
              td {{ t("怪物知訊數量") }}
              td
                el-input-number(v-model="settings.bossInfoCount" :min="1" :max="10" :step="1" @change="updateBossInfo" step-strictly)
        el-tab-pane(:label="t('功能')")
          table.setting-table
            tr
              td {{ t("自動儲存 (離線/分享生效)") }}
              td
                el-switch(v-model="settings.autosave")
          el-input(v-model="settings.id" :disabled="!!serverState.connectionState" :minlength="1" :maxlength="32" pattern="[0-9a-zA-Z]+" style="width: 80%")
            template(#prepend) ID
          el-input(v-model="settings.targetId" :disabled="!!clientState.connectionState" :minlength="1" :maxlength="32" pattern="[0-9a-zA-Z]+" style="width: 80%")
            template(#prepend) {{ t("目標 ID") }}

        el-tab-pane(:label="t('時間表')")
          table
            tr
              td {{ t("復活時間") }}
              td
                el-input-number(v-model="settings.monsterRespawnTime" @change="onChangeMonsterRespawnTime" :min="1" :max="3600" :step="1" step-strictly)
                span  {{ t("分鐘") }}
            tr
              td {{ t("隱藏怪物") }}
              td
                el-select(v-model="settings.bossesExclude" @change="onChangeBossesExclude" filterable multiple fit-input-width)
                  el-option(v-for="name of Area.getAllBossNames()" :key="name" :label="t(name)" :value="name")
                el-button(@click="onClickHideAllMonster") {{ t("隱藏所有怪物") }}
                el-button(@click="onClickShowAllMonster" style="margin-left: 0") {{ t("顯示所有怪物") }}
            tr
              td {{ t("隱藏線路") }}
              td
                el-select(v-model="settings.linesExclude" @visible-change="onLinesExcludeVisibleChange" @change="onChangeLineExcludeChange" filterable multiple fit-input-width)
                  el-option(v-for="line of Enumerable.range(1, areas[0].getLargestServerLine())" :key="line" :label="`${line}`" :value="line" )
          el-divider
          small *{{ t("更改線路上限需要手動重置時間表") }}
          br
          br
          table
            tr(v-for="name of Object.keys(Area.defaultAreas)")
              td {{ t(name) }}
              td
                el-input-number(v-model="settings.maxServerLine[name]" :min="1" :max="255" :step="1" step-strictly)
                span  {{ t("線") }}
          el-divider
          el-button(@click="onClickResetMerge" type="warning") {{ t("以目前時間重置時間表") }}

        el-tab-pane(:label="`${t('導入')}/${t('導出')}`")
          div.setting-row
            el-button(@click="onClickImport") {{ t("導入") }}
            el-button(@click="onClickExport") {{ t("導出") }}
          div.setting-row
            el-input(v-model="settings.importExportText" :rows="16" type="textarea")

        el-tab-pane(:label="t('重置')")
          el-button(@click="onClickReset" type="danger") {{ t("重置時間表") }}
          br
          br
          el-button(@click="onClickResetSettings" type="danger") {{ t("重置設定") }}
          br
          br
          el-button(@click="onClickResetSave" type="danger") {{ t("刪除存檔") }}
      template(#footer)
        el-button(@click="dialogs.settingDialogVisible = false") {{ t("關閉") }}

    el-dialog(v-model="dialogs.hostDialogVisible" width="80%" :fullscreen="!!(md.mobile() || md.tablet())")
      div
        el-row(:gutter="12")
          el-col(:span="16")
            el-input(v-model="settings.id" :disabled="!!serverState.connectionState" :minlength="1" :maxlength="32" pattern="[0-9a-zA-Z]+")
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

    el-dialog(v-model="dialogs.connectDialogVisible" width="80%" :fullscreen="!!(md.mobile() || md.tablet())")
      div
        el-row(:gutter="12")
          el-col(:span="16")
            el-input(v-model="settings.targetId" :disabled="!!clientState.connectionState" :minlength="1" :maxlength="32" pattern="[0-9a-zA-Z]+")
              template(#prepend) {{ t("目標 ID") }}
          el-col(:span="4")
            el-button(v-if="clientState.connectionState" @click="onClickCloseFollowing" type="danger") {{ t("取消跟蹤") }}
            el-button(v-else @click="onClickFollowTable" type="warning") {{ t("開始跟蹤") }}

    el-dialog(v-model="dialogs.viewDialogVisible" width="80%" :fullscreen="!!(md.mobile() || md.tablet())")
      div.view-table-filters
        div
          div {{ t("地圖") }}
          div
            el-select(v-model="areaTable.filters.areas" placeholder=" " filterable multiple)
              el-option(v-for="name of Object.keys(Area.defaultAreas)" :key="name" :label="t(name)" :value="name")
        div
          div {{ t("線路") }}
          div
            el-select(v-model="areaTable.filters.lines" placeholder=" " filterable multiple)
              el-option(v-for="name of Enumerable.range(1, areas[0].getLargestServerLine())" :key="name" :label="name" :value="name")
        div
          div {{ t("怪物名字") }}
          div
            el-select(v-model="areaTable.filters.bosses" placeholder=" " filterable multiple)
              el-option(v-for="name of Area.getAllBossNames()" :key="name" :label="t(name)" :value="name")
      el-table(:data="areasAsTableWithLimit()" table-layout="auto" @sort-change="areaTableOnSortChange")
        el-table-column(prop="area" :label="t('地圖')" sortable)
          template(#default="scope") {{ scope.row.area.name }}
        el-table-column(prop="server" :label="t('線路')" sortable)
          template(#default="scope") {{ scope.row.server.line }}
        el-table-column(prop="boss" :label="t('怪物名字')" sortable)
          template(#default="scope") {{ t(scope.row.boss.displayName(settings.showNickName)) }}
        el-table-column(:label="t('擊殺時間')" sortable)
          template(#default="scope") {{ scope.row.boss.killAt.unix() ? scope.row.boss.killAt.format('HH:mm:ss') : '-' }}
        el-table-column(:label="t('修改時間')")
          template(#default="scope")
            el-date-picker(type="datetime" v-model="scope.row.killAt" @change="areaTableOnDateChange(scope.row.boss, $event)" :disabled="!!clientState.connectionState")
      el-pagination(layout="prev, pager, next" v-model:current-page="areaTable.currentPage" :page-size="settings.areaTable.pageSize" :total="areasAsTableWithFilter().length")
    div.action-menu
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover")
        div {{ t("設定") }}
        template(#reference)
          el-button(@click="dialogs.settingDialogVisible = true" :icon="Setting" type="primary" :title="t('設定')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover")
        div {{ t("存檔") }}
        template(#reference)
          el-button(@click="onClickSave" type="success" :icon="DocumentAdd" :title="t('存檔')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover")
        div {{ t("讀取") }}
        template(#reference)
          el-button(@click="onClickLoad" type="warning" :icon="Reading" :title="t('讀取')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover")
        div {{ t("查看") }}
        template(#reference)
          el-button(@click="onClickViewDialogVisible" type="primary" :icon="Search" :title="t('查看')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover")
        div {{ t("開場") }}
        template(#reference)
          el-button(@click="dialogs.hostDialogVisible = true" type="success" :icon="Share" :title="t('開場')")
      el-popover(placement="top-start" trigger="hover" popper-class="action-menu__buttons-popover")
        div {{ t("進場") }}
        template(#reference)
          el-button(@click="dialogs.connectDialogVisible = true" :icon="View" type="primary" :title="t('進場')")
      span.settings_menu-icon(v-if="serverState.connectionState" @click="onClickAskStopHosting" style="cursor: pointer")
        el-tooltip(:content="t('允許同步')" placement="top-start")
          el-icon
            Share
      span.settings_menu-icon(v-if="clientState.connectionState === ConnectionState.connected" @click="onClickAskStopFollowing" style="cursor: pointer")
        el-tooltip(:content="t('正在跟蹤')" placement="top-start")
          el-icon
            View
      span.settings_menu-icon(v-if="serverState.connectionState") {{ settings.id }}
      span.settings_menu-icon(v-if="clientState.connectionState === ConnectionState.connected") {{ settings.targetId }}
    br
    el-tabs(v-model="timetableTabs.areaActiveTab" @tab-change="onChangeAreaTab" :key="forceUpdateTimetable" type="border-card")
      el-tab-pane(v-for="area of areas" :label="t(area.name)" :name="area.name" lazy)

        el-tabs.monster-trace-tab(v-if="settings.viewMode === 'byLine'" v-model="timetableTabs.bossActiveLineTab" @tab-change="onChangeBossTab" type="border-card")
          el-tab-pane(v-for="server of area.getServers(linesExclude)" :label="`${server.line}`" :name="`${server.line}`" lazy)
            div.monster-trace__container
              div.monster-trace__button-container(v-for="boss in server.getBosses(bossesExclude)")
                el-button.monster-trace__button.monster-trace__button--name(v-if="bossButtonStates[area.name][server.line][boss.name]" @click="toggle(area, server.line, boss)" :color="boss.color") {{ t(boss.displayName(settings.showNickName)) }}
                template(v-else)
                  el-popconfirm(:title="`${t('確認復活怪物')}?`" @confirm="toggle(area, server.line, boss)" width="auto")
                    template(#reference)
                      el-button.monster-trace__button.monster-trace__button--name(type="danger") {{ t(boss.displayName(settings.showNickName)) }}

        el-tabs.monster-trace-tab(v-else-if="settings.viewMode === 'byBoss'" v-model="timetableTabs.bossActiveTab" @tab-change="onChangeBossTab" type="border-card")
          el-tab-pane(v-for="_boss of area.servers[0].getBosses(bossesExclude)" :label="t(_boss.name)" :name="_boss.name" lazy)
            div.monster-trace__container
              div.monster-trace__button-container(v-for="line in Enumerable.from(area.getServers(linesExclude)).select((s) => s.line)")
                template(v-for="boss of [area.findBoss(line, _boss.name)]")
                  el-button.monster-trace__button(v-if="bossButtonStates[area.name][line][boss.name]" @click="toggle(area, line, boss)" :color="boss.color") {{ line }}
                  template(v-else)
                    el-popconfirm(:title="`${t('確認復活怪物')}?`" @confirm="toggle(area, line, boss)" width="auto")
                      template(#reference)
                        el-button.monster-trace__button(type="danger") {{ line }}
    br
    div.boss-info-container
      div(v-if="settings.viewMode === 'byBoss' && settings.showBossCurrentTypeSuggestion")
        div.next-server-suggest
          h4 {{ t("線路建議 (當前怪物)") }}
          el-row(v-for="info of nextLineSuggestServerByBoss[timetableTabs.bossActiveTab]")
            el-col(v-if="settings.language.startsWith('en')")
              span {{ t("線") }}
              span.next-server-suggest__line-text {{ info.server.line }}
              span {{ t(info.boss.displayName(settings.showNickName)) }}
            el-col(v-else)
              span.next-server-suggest__line-text {{ info.server.line }}
              span {{ t("線") }}
              span  / {{ t(info.boss.displayName(settings.showNickName)) }}
      div(v-if="settings.showBossSuggestion")
        div.next-server-suggest
          h4 {{ t("線路建議") }}
          el-row(v-for="info of nextLineSuggestServer")
            el-col(v-if="settings.language.startsWith('en')")
              span {{ t("線") }}
              span.next-server-suggest__line-text {{ info.server.line }}
              span {{ t(info.boss.displayName(settings.showNickName)) }}
            el-col(v-else)
              span.next-server-suggest__line-text {{ info.server.line }}
              span {{ t("線") }}
              span  / {{ t(info.boss.displayName(settings.showNickName)) }}
      div(v-if="settings.showBossInfoRecentKilled")
        div.recent-boss-kill
          h4 {{ t("最近死亡怪物") }}
          el-row(v-for="info of recentBossKills")
            el-col(v-if="settings.language.startsWith('en')")
              span {{ t("線") }}
              span.next-server-suggest__line-text {{ info.server.line }}
              span / {{ t(info.boss.displayName(settings.showNickName)) }} / {{ info.boss.killAt.format('HH:mm:ss') }}
            el-col(v-else)
              span.next-server-suggest__line-text {{ info.server.line }}
              span  {{ t("線") }} / {{ t(info.boss.displayName(settings.showNickName)) }} / {{ info.boss.killAt.format('HH:mm:ss') }}
</template>

<style lang="sass">
.setting-row
  margin-bottom: 12px

.setting-table td:nth-child(even)
  padding-left: 12px

.action-menu
  display: flex
  align-items: center

.action-menu__buttons-popover
  min-width: auto !important
  width: auto !important

.settings_menu-icon
  margin-left: 12px

.view-table-filters
  display: flex
  flex-direction: row
  flex-wrap: wrap
  column-gap: 12px
  row-gap: 12px
  justify-content: right
  margin-bottom: 6px
  > div
    display: flex
    align-items: center
    > div:nth-child(odd)
        margin-right: 6px

.monster-trace-tab
  margin: -15px

.monster-trace__container
  display: grid
  width: 600px
  grid-template-columns: repeat(10, 1fr)
  col-gap: 12px
  row-gap: 12px

@media (max-width: 630px)
  .monster-trace__container
    width: 100%
    display: flex
    flex-wrap: wrap
    row-gap: 0
  .monster-trace__button
    margin: 6px

.monster-trace__button
  width: 50px
  height: 40px

.monster-trace__button--name
  width: auto
  margin-left: 12px

.next-server-suggest__line-text
  padding-left: 6px
  padding-right: 6px
  font-size: 30px

.boss-info-container
  display: flex
  flex-direction: row
  flex-wrap: wrap
  column-gap: 24px
</style>
