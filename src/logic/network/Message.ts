import { Expose } from "class-transformer";
import { IsInt, IsString, MaxLength, Min } from "class-validator";

export default class Message {
  @Expose()
  @IsInt()
  @Min(1)
  version = 1;

  @Expose()
  @IsString()
  @MaxLength(255)
  cmd = "";
}
