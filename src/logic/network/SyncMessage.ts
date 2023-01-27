import { Expose, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsDefined,
  IsInt,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import Area from "../Area";
import Message from "./Message";

export default class SyncMessage extends Message {
  static cmd = "tofmt/sync";

  static fromPlain(plain: Record<string, unknown>) {
    return super._fromPlain(this, plain);
  }

  static fromMessagePack(buffer: Uint8Array) {
    return super._fromMessagePack(this, buffer);
  }

  static fromMessagePackZstd(buffer: Uint8Array) {
    return super._fromMessagePackZstd(this, buffer);
  }

  static fromMessagePackZstdBase64(base64: string) {
    return super._fromMessagePackZstdBase64(this, base64);
  }

  static create(
    areas = [] as Area[],
    bossesExclude = [] as string[],
    linesExclude = [] as number[]
  ) {
    const message = new this();
    message.payload.areas = areas;
    message.payload.bossesExclude = bossesExclude;
    message.payload.linesExclude = linesExclude;
    return message;
  }

  cmd = SyncMessage.cmd;

  @Expose()
  @Type(() => MTPayload)
  @IsDefined()
  payload = new MTPayload();
}

export class MTPayload {
  @Expose()
  @Type(() => Area)
  @ArrayMaxSize(Object.keys(Area.defaultAreas).length)
  areas = [] as Area[];

  @Expose()
  @ArrayMaxSize(Area.getAllBossNames().length)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  bossesExclude = [] as string[];

  @Expose()
  @ArrayMaxSize(Area.limits.line)
  @IsInt({ each: true })
  @Min(0, { each: true })
  linesExclude = [] as number[];
}
