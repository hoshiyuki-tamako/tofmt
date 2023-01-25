import { Expose, instanceToPlain, Type } from "class-transformer";
import {
  IsDefined,
  ArrayMaxSize,
  IsInt,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import Message from "./Message";

import Area from "../Area";

export default class SyncMessage extends Message {
  static cmd = "tofmt/sync";

  static create(
    areas: Area[],
    bossesExclude = [] as string[],
    linesExclude = [] as number[]
  ) {
    const message = new this();
    message.payload.areas = areas;
    message.payload.bossesExclude = bossesExclude;
    message.payload.linesExclude = linesExclude;
    return instanceToPlain(message);
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
  @ArrayMaxSize(10)
  areas = [] as Area[];

  @Expose()
  @ArrayMaxSize(Area.getAllBossNames().length)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  bossesExclude = [] as string[];

  @Expose()
  @ArrayMaxSize(255)
  @IsInt({ each: true })
  @Min(0, { each: true })
  linesExclude = [] as number[];
}
