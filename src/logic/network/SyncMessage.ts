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
  static create(
    areas: Area[],
    bossesExclude = [] as string[],
    linesExclude = [] as number[]
  ) {
    const message = {
      version: 1,
      cmd: "tofmt/sync",
      payload: {
        areas: areas.map((m) => instanceToPlain(m)),
        bossesExclude,
        linesExclude,
      },
    };
    return message;
  }

  @Expose()
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
