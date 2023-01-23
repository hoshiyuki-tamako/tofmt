import LRU from "lru-cache";
import { Expose, Type } from "class-transformer";
import { ArrayMaxSize, IsInt, Max, Min } from "class-validator";
import BossEntity from "./BossEntity";

export default class Server {
  @Expose()
  @IsInt()
  @Min(0, { message: "Line cannot be negative" })
  @Max(255, { message: "Line cannot larger than 255" })
  line = 0;

  @Expose()
  @Type(() => BossEntity)
  @ArrayMaxSize(255, {
    message: "Server bosses array size cannot larger than 255",
  })
  bosses = [] as BossEntity[];

  #getBossesCache = new LRU<string, BossEntity[]>({ max: 256 });

  constructor(line: number, bosses: BossEntity[] = []) {
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

  clearCache() {
    this.#getBossesCache.clear();
  }
}
