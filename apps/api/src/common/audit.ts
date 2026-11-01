import type { Tx } from "../db/database.js";

export interface AuditEntry {
  clanId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Ghi nhật ký thao tác trong cùng transaction với thay đổi (FR-ADMIN-02). */
export async function audit(trx: Tx, e: AuditEntry): Promise<void> {
  await trx
    .insertInto("audit_logs")
    .values({
      clan_id: e.clanId,
      actor_id: e.actorId,
      action: e.action,
      entity: e.entity,
      entity_id: e.entityId ?? null,
      before: e.before === undefined ? null : JSON.stringify(e.before),
      after: e.after === undefined ? null : JSON.stringify(e.after),
    })
    .execute();
}
