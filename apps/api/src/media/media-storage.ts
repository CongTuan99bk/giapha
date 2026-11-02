import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config.js";

/**
 * Nơi lưu file ảnh (ADR-015). Hiện là ổ đĩa của máy chủ (VPS ~10 USD/tháng, ADR-007);
 * đổi sang kho S3/R2 sau này chỉ cần viết lớp khác cùng các hàm put/pathOf/remove.
 */
@Injectable()
export class MediaStorage {
  readonly root: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.root = isAbsolute(config.MEDIA_DIR) ? config.MEDIA_DIR : resolve(process.cwd(), config.MEDIA_DIR);
  }

  /** Đường dẫn tuyệt đối của một khoá, chặn thoát ra ngoài thư mục gốc. */
  pathOf(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`Khoá lưu trữ không hợp lệ: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.pathOf(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  /** Xoá cả thư mục của một ảnh (mọi cỡ) */
  async removeDir(prefix: string): Promise<void> {
    await rm(this.pathOf(prefix), { recursive: true, force: true });
  }

  join(...parts: string[]): string {
    return join(...parts);
  }
}
