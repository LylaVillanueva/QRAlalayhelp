import { pool } from "@/db/pool";
import type { AuthUser, UserRole } from "@/types/domain";

export interface AuditLogInput {
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** [5] Incident Lifecycle History & System Audit Logs — append-only. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await pool.query(
    `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.actorId ?? null,
      input.actorRole ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

/**
 * Barangay officials see every log; guardians see only actions performed
 * by their own account.
 * Responders only see their own history — actions they themselves took —
 * not the full barangay trail, which stays an official-only view.
 */
export async function listAuditLogs(
  params: { entityType?: string; entityId?: string; limit?: number; offset?: number },
  actor: AuthUser
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.entityType) {
    conditions.push(`entity_type = $${i++}`);
    values.push(params.entityType);
  }
  if (params.entityId) {
    conditions.push(`entity_id = $${i++}`);
    values.push(params.entityId);
  }
  if (actor.role === "barangay_official") {
    conditions.push(`(actor_id in (select id from users where barangay_id = $${i})
      or (entity_type = 'resident' and entity_id in (select id from residents where barangay_id = $${i}))
      or (entity_type = 'incident' and entity_id in (select i.id from incidents i join residents r on r.id = i.resident_id where r.barangay_id = $${i})))`);
    values.push(actor.barangayId);
    i++;
  } else if (actor.role === "guardian") {
    conditions.push(`actor_id = $${i} and actor_role = 'guardian'`);
    values.push(actor.id);
    i++;
  } else if (actor.role === "barangay_responder") {
    conditions.push(`actor_id = $${i}`);
    values.push(actor.id);
    i++;
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const { rows } = await pool.query(
    `select * from audit_logs ${where} order by created_at desc limit $${i++} offset $${i++}`,
    [...values, limit, offset]
  );
  return rows;
}
