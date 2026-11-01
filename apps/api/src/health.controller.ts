import { Controller, Get } from "@nestjs/common";
import { sql } from "kysely";
import { Public } from "./common/context.js";
import { Database } from "./db/database.js";

@Controller("health")
export class HealthController {
  constructor(private readonly db: Database) {}

  /** Cho Uptime Kuma / Docker healthcheck */
  @Public()
  @Get()
  async health() {
    await sql`select 1`.execute(this.db.app);
    return { status: "ok" };
  }
}
