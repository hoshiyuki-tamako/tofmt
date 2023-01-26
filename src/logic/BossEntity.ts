import { Expose, Transform } from "class-transformer";
import { IsDefined, IsHexColor, IsString, MaxLength } from "class-validator";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

export default class BossEntity {
  static defaultRespawnTime = dayjs.duration({ hours: 1 });

  // data
  @Expose()
  @IsString()
  @MaxLength(255)
  name = "";

  @Expose()
  @IsString()
  @MaxLength(255)
  nickName = "";

  @Expose()
  @Transform(({ value }) => dayjs(value), { toClassOnly: true })
  @Transform(({ value }) => +value, { toPlainOnly: true })
  @IsDefined()
  killAt = dayjs.unix(0);

  @Expose()
  @Transform(({ value }) => dayjs.duration({ milliseconds: value }), {
    toClassOnly: true,
  })
  @Transform(({ value }) => value.asMilliseconds(), { toPlainOnly: true })
  @IsDefined()
  respawnTime = BossEntity.defaultRespawnTime;

  // ui
  @Expose()
  @IsHexColor()
  color = "";

  constructor(
    name = "",
    nickName = "",
    color = "",
    respawnTime = BossEntity.defaultRespawnTime
  ) {
    this.name = name || "";
    this.nickName = nickName || name;
    this.color = color || "";
    this.respawnTime = respawnTime || BossEntity.defaultRespawnTime;
  }

  isAlive(now = dayjs()) {
    return now.diff(this.killAt.add(this.respawnTime)) > 0;
  }

  respawn() {
    this.killAt = dayjs.unix(0);
  }

  kill(now = dayjs()) {
    this.killAt = now;
  }

  timeUntilRespawnMs(now = dayjs()) {
    const ms = this.killAt.add(this.respawnTime).diff(now);
    return ms >= 0 ? ms : 0;
  }

  displayName(nickName = false) {
    return nickName ? this.nickName : this.name;
  }
}
