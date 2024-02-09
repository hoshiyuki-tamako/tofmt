import { Expose, instanceToPlain, Transform } from 'class-transformer'
import { IsDefined, IsInt, IsString, MaxLength, Min } from 'class-validator'
import dayjs from 'dayjs'
import { Packr } from 'msgpackr'
import { Zstd } from '@hpcc-js/wasm/zstd'
import { transformAndValidateSync, type ClassType } from 'class-transformer-validator'
export default abstract class Message {
  static packr = new Packr()
  static zstd: Zstd
  static async zstdLoad() {
    return (this.zstd ??= await Zstd.load())
  }

  protected static _fromPlain<T extends object>(
    type: ClassType<T>,
    plain: Record<string, unknown>
  ) {
    return transformAndValidateSync(type, plain)
  }

  protected static _fromMessagePack<T extends object>(type: ClassType<T>, buffer: Uint8Array) {
    return this._fromPlain(type, this.packr.unpack(buffer))
  }

  protected static async _fromMessagePackZstd<T extends object>(
    type: ClassType<T>,
    buffer: Uint8Array
  ) {
    const zstd = await this.zstdLoad()
    return this._fromMessagePack(type, zstd.decompress(buffer))
  }

  protected static _fromMessagePackZstdBase64<T extends object>(
    type: ClassType<T>,
    base64Data: string
  ) {
    return this._fromMessagePackZstd(
      type,
      new Uint8Array(
        atob(base64Data)
          .split('')
          .map((c) => c.charCodeAt(0))
      )
    )
  }

  @Expose()
  @IsInt()
  @Min(1)
  version = 1

  @Expose()
  @IsString()
  @MaxLength(255)
  cmd = ''

  @Expose()
  @Transform(({ value }) => dayjs(value), { toClassOnly: true })
  @Transform(({ value }) => +value, { toPlainOnly: true })
  @IsDefined()
  createdAt = dayjs()

  toPlain() {
    return instanceToPlain(this)
  }

  toMessagePack() {
    return Message.packr.encode(this.toPlain())
  }

  async toMessagePackZstd(compressionLevel?: number) {
    const zstd = await Message.zstdLoad()
    return zstd.compress(this.toMessagePack(), compressionLevel ?? zstd.maxCLevel())
  }

  async toMessagePackZstdBase64() {
    return btoa(String.fromCharCode(...(await this.toMessagePackZstd())))
  }
}
