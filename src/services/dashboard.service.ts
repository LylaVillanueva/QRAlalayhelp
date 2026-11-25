import { pool } from "@/db/pool";
import { AppError } from "@/utils/errors";
import type { AuthUser } from "@/types/domain";

/**
 * Barangay staff home-screen summary — open alerts, enrolled residents,
 * guardian accounts still pending their first login ("unverified"), and
 * alerts wrapped up today (confirmed safe, resolved, or closed). All four
 * numbers are scoped to the actor's own barangay in a single round trip.
 */
export async function getDashboardStats(actor: AuthUser) {
  if (actor.role !== "barangay_official" && actor.role !== "barangay_responder") {
    throw AppError.forbidden("Only barangay staff can view the dashboard", "FORBIDDEN_ROLE");
  }
  if (!actor.barangayId) throw AppError.badRequest("Your account is not linked to a barangay", "NO_BARANGAY");

  const { rows } = await pool.query(
    `select
       (select count(*)::int from incidents i join residents r on r.id = i.resident_id
        where r.barangay_id = $1 and i.status in ('active','confirmed_not_safe','escalated','assigned')) as open_alerts,
       (select count(*)::int from residents where barangay_id = $1 and is_active = true
        and (resident_type is null or resident_type not in ('Guardian','Responder','Barangay Official'))) as residents,
       (select count(*)::int from residents r where r.barangay_id = $1 and r.is_active = true and r.guardian_id is not null
        and not exists (select 1 from refresh_tokens rt where rt.user_id = r.guardian_id)) as unverified_records,
       (select count(*)::int from incident_details i join residents r on r.id = i.resident_id
        where r.barangay_id = $1 and i.status in ('confirmed_safe','resolved','closed')
        and coalesce(i.closed_at, i.resolved_at, i.updated_at) >= date_trunc('day', now())) as done_today`,
    [actor.barangayId]
  );

  const row = rows[0];
  return {
    openAlerts: row.open_alerts,
    residents: row.residents,
    unverifiedRecords: row.unverified_records,
    doneToday: row.done_today,
  };
}
