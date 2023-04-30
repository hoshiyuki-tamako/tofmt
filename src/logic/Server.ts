import { Expose, Type } from "class-transformer";
import { ArrayMaxSize, IsInt, Max, Min } from "class-validator";
import Enumerable from "linq";
import { LRUCache } from "lru-cache";

import BossEntity from "./BossEntity";

export default class Server {
  @Expose()
  @IsInt()
  @Min(0)
  @Max(255)
  line = 0;

  @Expose()
  @Type(() => BossEntity)
  @ArrayMaxSize(255)
  bosses = [] as BossEntity[];

  #bossLookup?: Record<string, BossEntity>;
  #getBossesCache = new LRUCache<string, BossEntity[]>({ max: 256 });

  constructor(line = 0, bosses: BossEntity[] = []) {
    this.line = line;
    this.bosses = bosses;
  }

  getBosses(excludeNames = [] as string[]) {
    const key = excludeNames.join("-");
    let bosses = this.#getBossesCache.get(key);
    if (!bosses) {
      bosses = this.bosses.filter((b) => !excludeNames.includes(b.name));
      this.#getBossesCache.set(key, bosses);
    }
    return bosses;
  }

  findBoss(name: string) {
    this.#bossLookup ??= Enumerable.from(this.bosses).toObject(
      (boss) => boss.name,
      (boss) => boss
    );
    return this.#bossLookup[name];
  }

  clearCache() {
    this.#bossLookup = undefined;
    this.#getBossesCache.clear();
    return this;
  }
}
