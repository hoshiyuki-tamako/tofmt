import { Expose, Type } from "class-transformer";
import { ArrayMaxSize, IsString, MaxLength } from "class-validator";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Enumerable from "linq";
import LRU from "lru-cache";

import BossEntity from "./BossEntity";
import Server from "./Server";

dayjs.extend(duration);

export default class Area {
  static defaultAreas = {
    亞夏: {
      maxLine: 50,
      bosses: [
        // name, nickName, color
        ["羅貝拉格", "花", "#BB0001"],
        ["阿波菲斯", "狗", "#86775F"],
        ["急凍機甲", "龍蝦", "#910913"],
        ["索貝克", "鱷魚", "#3A4454"],
        ["露琪亞", "媽", "#BDA8A0"],
        ["巴巴羅薩", "雙頭狗", "#613655"],
      ],
    },
    人工島: {
      maxLine: 50,
      bosses: [
        ["間躍雙火龍", "火龍", "#5E5F84"],
        ["吞噬者", "青蛙", "#668291"],
      ],
    },
    維拉: {
      maxLine: 50,
      bosses: [
        ["瑪格瑪", "鹿", "#353231"],
        ["倫迪爾", "沙鱷魚", "#404546"],
        ["伊娃", "棉花", "#FFFFFF"],
      ],
    },
    深淵: {
      maxLine: 50,
      bosses: [
        ["海拉", "海拉", "#15151F"],
        ["科爾頓", "河馬", "#48525D"],
      ],
    },
    溟海: {
      maxLine: 50,
      bosses: [
        ["哈伯拉", "哈伯拉", "#F0DA52"],
        ["絲奇拉", "絲奇拉", "#737B98"],
      ],
    },
  };

  static generateAreas(
    maxServerLineOverride?: Record<string, number>,
    respawnTime?: number
  ) {
    const areas = [] as Area[];
    for (const [name, properties] of Object.entries(this.defaultAreas)) {
      const servers = [] as Server[];
      for (const line of Enumerable.range(
        1,
        maxServerLineOverride?.[name] || properties.maxLine
      )) {
        const bosses = [] as BossEntity[];
        for (const [name, nickName, color] of properties.bosses) {
          const boss = new BossEntity(
            name,
            nickName,
            color,
            respawnTime ? dayjs.duration({ minutes: respawnTime }) : undefined
          );
          bosses.push(boss);
        }
        const server = new Server(line, bosses);
        servers.push(server);
      }
      const area = new Area(name, servers);
      areas.push(area);
    }
    return areas;
  }

  static getAllBossNames() {
    return Enumerable.from(Object.values(this.defaultAreas))
      .selectMany((area) => area.bosses)
      .select((boss) => boss[0])
      .toArray();
  }

  @Expose()
  @IsString()
  @MaxLength(255, { message: "Area name too long" })
  name = "";

  @Expose()
  @Type(() => Server)
  @ArrayMaxSize(255, {
    message: "Area server array size cannot larger than 255",
  })
  servers = [] as Server[];

  #largestServerLine?: number;
  #serverLookup?: Record<number, Server>;
  #getServersCache = new LRU<string, Server[]>({ max: 16 });

  constructor(name: string, servers: Server[] = []) {
    this.name = name;
    this.servers = servers;
  }

  getServers(excludeLines = [] as number[]) {
    const key = excludeLines.join("-");
    let servers = this.#getServersCache.get(key);
    if (!servers) {
      servers = this.servers.filter((s) => !excludeLines.includes(s.line));
      this.#getServersCache.set(key, servers);
    }
    return servers;
  }

  findServer(line: number) {
    this.#serverLookup ??= Enumerable.from(this.servers).toObject(
      (server) => server.line,
      (server) => server
    );
    return this.#serverLookup[line];
  }

  getLargestServerLine() {
    return (this.#largestServerLine ??= Enumerable.from(this.servers)
      .select((s) => s.line)
      .max());
  }

  findBoss(line: number, bossName: string) {
    return this.findServer(line)?.findBoss(bossName);
  }

  setGlobalBossRespawnTime(minutes = 60) {
    for (const server of this.servers) {
      for (const boss of server.bosses) {
        boss.respawnTime = dayjs.duration({ minutes });
      }
    }
    return this;
  }

  clearCache() {
    this.#serverLookup = undefined;
    this.#getServersCache.clear();
    for (const server of this.servers) {
      server.clearCache();
    }
    return this;
  }
}
