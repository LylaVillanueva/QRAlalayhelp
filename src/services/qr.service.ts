import { pool, withTransaction } from "@/db/pool";
import { env } from "@/config/env";
import { generateQrToken } from "@/utils/crypto";
import { AppError } from "@/utils/errors";
import type { AuthUser } from "@/types/domain";

/**
 * [3] Real-Time Generated QR Code & Printing Token
 * [4] Print Ready Level Q QR Code
 * Generates (or re-issues) the single active QR token for a resident.
 */
export async function generateQrForResident(residentId: string, issuedBy: AuthUser) {
  if (issuedBy.role !== 'barangay_official') throw AppError.forbidden('Only barangay officials can issue QR cards');
  return withTransaction(async (client) => {
    const { rows: residentRows } = await client.query(`select id, barangay_id from residents where id = $1 for update`, [residentId]);
    if (!residentRows[0]) throw AppError.notFound("Resident not found", "RESIDENT_NOT_FOUND");

    if (issuedBy.role === "barangay_official" && issuedBy.barangayId !== residentRows[0].barangay_id) {
      throw AppError.forbidden("You can only issue QR codes for residents in your barangay", "BARANGAY_MISMATCH");
    }

    // Revoke any currently-active token (a resident has exactly one live QR).
    await client.query(
      `update qr_tokens set status = 'reissued', revoked_at = now() where resident_id = $1 and status = 'active'`,
      [residentId]
    );

    const token = generateQrToken();
    const { rows } = await client.query(
      `insert into qr_tokens (token, resident_id, status, issued_by)
       values ($1, $2, 'active', $3)
       returning *`,
      [token, residentId, issuedBy.id]
    );

    await client.query(
      `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id)
       values ($1, $2, 'qr.generated', 'resident', $3)`,
      [issuedBy.id, issuedBy.role, residentId]
    );

    const publicScanUrl = `${env.web.publicOrigin}/scan/${token}`;
    // The level is a fixed setting (QR_LEVEL_Q_ERROR_CORRECTION), not stored
    // per code; the app uses it to draw the printable QR.
    return { ...rows[0], error_correction: env.qr.errorCorrection, publicScanUrl };
  });
}

/**
 * [8]/[9] Silent System Initialization + Anonymized Emergency Landing Page.
 * Returns only public assistance context. Resident names, health information,
 * contact details, and internal identifiers must not cross this boundary.
 */
export async function getPublicQrView(token: string) {
  const { rows } = await pool.query(
    `select qt.status, r.is_active, b.name as barangay_name
     from qr_tokens qt
     join residents r on r.id = qt.resident_id
     left join barangays b on b.id = r.barangay_id
     where qt.token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row || row.status !== "active" || !row.is_active) {
    throw AppError.notFound("This QR code is not active.", "QR_NOT_ACTIVE");
  }

  return {
    barangayName: row.barangay_name ?? null,
  };
}

export async function revokeQrToken(token: string, actor: AuthUser) {
  if (actor.role !== 'barangay_official') throw AppError.forbidden('Only barangay officials can revoke QR cards');
  return withTransaction(async (client) => {
    const { rows } = await client.query(`update qr_tokens qt set status = 'revoked', revoked_at = now()
      from residents r where qt.token = $1 and r.id = qt.resident_id and r.barangay_id = $2 returning qt.*`, [token, actor.barangayId]);
    if (!rows[0]) throw AppError.notFound("QR token not found", "QR_NOT_FOUND");
    await client.query(
      `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id)
       values ($1, $2, 'qr.revoked', 'resident', $3)`,
      [actor.id, actor.role, rows[0].resident_id]
    );
    return rows[0];
  });
}
