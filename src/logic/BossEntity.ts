import { Expose, Transform } from "class-transformer";
import { MaxLength, IsHexColor, Min, IsInt, IsString } from "class-validator";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
dayjs.extend(duration);

export default class BossEntity {
  static defaultRespawnTime = dayjs.duration({ hours: 1 });

  // data
  @Expose()
  @IsString()
  @MaxLength(255, { message: "Boss name too long" })
  name = "";

  @Expose()
  @IsString()
  @MaxLength(255, { message: "Nickname too long" })
  nickName = "";

  @Expose()
  @Transform(({ value }) => dayjs.unix(value), { toClassOnly: true })
  @Transform(({ value }) => value.unix(), { toPlainOnly: true })
  @IsInt()
  @Min(0)
  killAt = dayjs.unix(0);

  @Expose()
  @Transform(({ value }) => dayjs.duration({ milliseconds: value }), {
    toClassOnly: true,
  })
  @Transform(({ value }) => value.asMilliseconds(), { toPlainOnly: true })
  @IsInt()
  @Min(0)
  respawnTime = BossEntity.defaultRespawnTime;

  // ui
  @Expose()
  @IsHexColor({ message: "color incorrect value" })
  color = "";

  constructor(
    name = "",
    nickName = "",
    color = "",
    respawnTime = BossEntity.defaultRespawnTime
  ) {
    this.name = name;
    this.nickName = nickName || name;
    this.color = color;
    this.respawnTime = respawnTime;
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
