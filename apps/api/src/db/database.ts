import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import pg from "pg";
import { APP_CONFIG, type AppConfig } from "../config.js";
import type { DB } from "./generated.js";

// DATE trả về chuỗi "YYYY-MM-DD" (không đổi sang Date để tránh lệch múi giờ)
pg.types.setTypeParser(1082, (v) => v);
// BIGINT (audit_logs.id, số tiền) giữ dạng chuỗi
pg.types.setTypeParser(20, (v) => v);

export type Tx = Transaction<DB>;

export interface ClanContext {
  clanId: string;
  userId: string | null;
}

/**
 * Truy cập cơ sở dữ liệu.
 *
 * - `app`: role coinguon_app, mọi truy vấn dữ liệu dòng họ PHẢI đi qua `withClan()`
 *   để đặt `app.clan_id` trong transaction — Row-Level Security lọc theo giá trị này (ADR-003).
 * - `platform`: role BYPASSRLS, chỉ dùng cho tác vụ nền tảng có kiểm soát (không dùng trong request thường).
 */
@Injectable()
export class Database implements OnModuleDestroy {
  readonly app: Kysely<DB>;
  readonly platform: Kysely<DB>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.app = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: config.APP_DATABASE_URL, max: 20 }) }),
    });
    this.platform = new Kysely<DB>({
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: config.PLATFORM_DATABASE_URL, max: 5 }) }),
    });
  }

  /** Chạy `fn` trong một transaction với ngữ cảnh dòng họ (và người dùng) đã đặt. */
  withClan<T>(ctx: ClanContext, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.app.transaction().execute(async (trx) => {
      await sql`select set_config('app.clan_id', ${ctx.clanId}, true), set_config('app.user_id', ${ctx.userId ?? ""}, true)`.execute(trx);
      return fn(trx);
    });
  }

  /** Transaction chỉ với ngữ cảnh người dùng (vd. liệt kê các dòng họ của tôi). */
  withUser<T>(userId: string, fn: (trx: Tx) => Promise<T>): Promise<T> {
    return this.app.transaction().execute(async (trx) => {
      await sql`select set_config('app.user_id', ${userId}, true)`.execute(trx);
      return fn(trx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.app.destroy(), this.platform.destroy()]);
  }
}
