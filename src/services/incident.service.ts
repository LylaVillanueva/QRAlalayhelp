import { safetyConfirmed, canCloseIncident, guardianWaived, hasDiscrepancy } from "./incident-policy";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "@/db/pool";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { writeAuditLog } from "@/services/audit.service";
import { sendPushNotification } from "@/services/notification.service";
import { realtimeBus, RealtimeEvents } from "@/services/realtime";
import { randomUrlSafeToken } from "@/utils/crypto";
import { reverseGeocode, distanceMeters } from "@/services/geocode.service";
import { logger } from "@/utils/logger";
import type { AuthUser, ConfirmationDecision } from "@/types/domain";

const OPEN_STATUSES = ["active", "confirmed_not_safe", "escalated", "assigned"];

type Db = Pick<PoolClient, "query">;

/**
 * Incidents are split by topic (migration 014): the core row lives in
 * `incidents`, and responder work, guardian follow-up, outcomes, the
 * bystander cancel window and live positions each have their own table.
 * The `incident_details` view joins them back into one row with the
 * original column names, so every read (and every API response) goes
 * through it.
 */
async function loadIncident(db: Db, incidentId: string) {
  const { rows } = await db.query(`select * from incident_details where id = $1`, [incidentId]);
  return rows[0];
}

export interface CreateIncidentInput {
  qrToken: string;
  latitude?: number;
  longitude?: number;
  bystanderNotes?: string;
}

/**
 * [6] Scans QR Code -> [7] Generate Alert & Saves Location/Notes.
 * Public, unauthenticated entry point triggered from the anonymized
 * emergency landing page. Also logs the raw scan event regardless of
 * whether the bystander proceeds to raise an alert.
 */
export async function createIncidentFromScan(input: CreateIncidentInput) {
  const result = await withTransaction(async (client) => {
    const { rows: qrRows } = await client.query(
      `select qt.token, qt.resident_id, qt.status, r.barangay_id, r.guardian_id
       from qr_tokens qt join residents r on r.id = qt.resident_id
       where qt.token = $1 for update of r`,
      [input.qrToken]
    );
    const qr = qrRows[0];
    if (!qr || qr.status !== "active") throw AppError.notFound("QR code is not active", "QR_NOT_ACTIVE");

    // One open alert per resident. Another scan while it's open (nobody has
    // cancelled or resolved it yet) is someone else reporting the same
    // emergency: log it against that incident and escalate it rather than
    // opening a duplicate alert.
    const existing = await findOpenIncident(client, qr.resident_id);
    if (existing) {
      const escalated = await escalateFromRepeatReport(client, existing, {
        source: "qr_scan", notes: input.bystanderNotes,
      });
      // A later scanner joins the incident, but must not receive the
      // original scanner's cancellation credential. They are on scene too,
      // though, so they get their own location-share credential.
      const locationShareToken = await createLocationShare(client, existing.id);
      return { ...escalated, cancel_token: null, cancellable_until: null, location_share_token: locationShareToken, joined: true };
    }

    const { rows: incidentRows } = await client.query(
      `insert into incidents (resident_id, qr_token, status, scan_latitude, scan_longitude, bystander_notes, timeout_at)
       values ($1, $2, 'active', $3, $4, $5, now() + interval '1 minute' * $6)
       returning id`,
      [qr.resident_id, qr.token, input.latitude ?? null, input.longitude ?? null, input.bystanderNotes ?? null, env.incident.timeoutMinutes]
    );
    const incidentId = incidentRows[0].id;
    const cancelToken = randomUrlSafeToken(16);
    const { rows: cancelRows } = await client.query(
      `insert into incident_cancellations (incident_id, cancel_token, cancellable_until)
       values ($1, $2, now() + interval '1 minute' * $3)
       returning cancellable_until`,
      [incidentId, cancelToken, env.incident.cancelWindowMinutes]
    );
    const incident = await loadIncident(client, incidentId);


    await writeAuditLog({
      action: "incident.created",
      entityType: "incident",
      entityId: incident.id,
      metadata: { residentId: qr.resident_id, source: "qr_scan" },
    });

    // [8A] Triggers Dynamic Push Notification to guardian; [8B] display
    // on the barangay command console handled via the realtime bus.
    if (qr.guardian_id) {
      await sendPushNotification(qr.guardian_id, "Emergency Alert", "Your ward's QR code was just scanned. Tap to view.", {
        incidentId: incident.id,
      });
    }
    await notifyBarangayOfficials(qr.barangay_id, incident.id);

    realtimeBus.emit(RealtimeEvents.INCIDENT_CREATED, { incident, barangayId: qr.barangay_id, guardianId: qr.guardian_id });

    // Added after the broadcast on purpose: the share token goes back to this
    // scanner only, never to the rooms the incident row is published to.
    const locationShareToken = await createLocationShare(client, incident.id);
    return {
      ...incident,
      cancel_token: cancelToken,
      cancellable_until: cancelRows[0].cancellable_until,
      location_share_token: locationShareToken,
      joined: false,
    };
  });

  if (!result.joined) void fillScanAddress(result.id, input.latitude, input.longitude).catch((err) => logger.error({ err }, "incident.scan_geocode_failed"));
  const { joined, ...incident } = result;
  return incident;
}

async function findOpenIncident(client: PoolClient, residentId: string) {
  const { rows } = await client.query(
    `select id from incidents where resident_id = $1 and status::text = any($2::text[])
     order by created_at desc limit 1 for update`,
    [residentId, OPEN_STATUSES]
  );
  return rows[0] ? loadIncident(client, rows[0].id) : null;
}

interface RepeatReport {
  source: "qr_scan" | "app_direct_trigger";
  notes?: string;
  actor?: AuthUser;
}

/**
 * Someone else reported an emergency for a resident whose alert is still
 * open. Escalate that alert (unless it already is, or is already flagged
 * Not Safe), keep their note, and tell officials, the guardian and the
 * assigned responder that more people are reporting it.
 */
async function escalateFromRepeatReport(client: PoolClient, existing: Record<string, any>, report: RepeatReport) {
  const note = report.notes?.trim();
  await client.query(
    `update incidents set
       status = case when status in ('active','assigned') then 'escalated' else status end,
       escalated_at = coalesce(escalated_at, now()),
       report_count = report_count + 1,
       last_reported_at = now(),
       bystander_notes = case when $2::varchar is null then bystander_notes
         when bystander_notes is null or bystander_notes = '' then $2
         else substring(bystander_notes || E'\n\nAnother report: ' || $2 from 1 for 10000) end
     where id = $1`,
    [existing.id, note || null]
  );
  const incident = await loadIncident(client, existing.id);

  await writeAuditLog({
    actorId: report.actor?.id,
    actorRole: report.actor?.role,
    action: "incident.repeat_report_escalated",
    entityType: "incident",
    entityId: incident.id,
    metadata: { residentId: incident.resident_id, source: report.source, reportCount: incident.report_count },
  });
  realtimeBus.emit(RealtimeEvents.INCIDENT_ESCALATED, { incident });

  // A burst of scans from a crowd shouldn't become a burst of pushes.
  const recentlyNotified = existing.last_reported_at
    && Date.now() - new Date(existing.last_reported_at).getTime() < env.incident.repeatReportNoticeMinutes * 60_000;
  if (!recentlyNotified) {
    const { rows: residentRows } = await client.query(`select guardian_id, barangay_id from residents where id = $1`, [incident.resident_id]);
    const resident = residentRows[0];
    const message = `Another report came in for the same resident (${incident.report_count} reports). This alert has been escalated.`;
    const { rows: officials } = await client.query(
      `select id from users where barangay_id = $1 and role = 'barangay_official' and is_active`,
      [resident?.barangay_id]
    );
    const recipients = new Set<string>(officials.map((o) => o.id));
    if (resident?.guardian_id) recipients.add(resident.guardian_id);
    if (incident.assigned_responder_id) recipients.add(incident.assigned_responder_id);
    if (report.actor) recipients.delete(report.actor.id);
    await Promise.all([...recipients].map((id) => sendPushNotification(id, "Alert Escalated", message, { incidentId: incident.id })));
  }
  return incident;
}

/** Fills in the readable address for where the alert was raised. */
async function fillScanAddress(incidentId: string, latitude?: number, longitude?: number) {
  if (latitude == null || longitude == null) return;
  const address = await reverseGeocode(latitude, longitude);
  if (!address) return;
  await pool.query(`update incidents set scan_address = $2 where id = $1`, [incidentId, address]);
  const incident = await loadIncident(pool, incidentId);
  if (incident) realtimeBus.emit(RealtimeEvents.INCIDENT_LOCATION_UPDATED, { incident });
}

// A live position within this distance of the last resolved one reuses
// that address instead of looking it up again.
const LIVE_ADDRESS_MOVE_METERS = 25;

async function fillLiveAddress(shareToken: string, incidentId: string, latitude: number, longitude: number) {
  const address = await reverseGeocode(latitude, longitude);
  if (!address) return;
  await pool.query(
    `update incident_location_shares set address = $2, address_latitude = $3, address_longitude = $4 where token = $1`,
    [shareToken, address, latitude, longitude]
  );
  const incident = await loadIncident(pool, incidentId);
  if (incident) realtimeBus.emit(RealtimeEvents.INCIDENT_LOCATION_UPDATED, { incident });
}

async function createLocationShare(client: PoolClient, incidentId: string) {
  const token = randomUrlSafeToken(16);
  await client.query(`insert into incident_location_shares (token, incident_id) values ($1, $2)`, [token, incidentId]);
  return token;
}

/**
 * POST /api/qr/location — a bystander's live location ping. Possession of
 * the share token from their scan-event response is the credential, same
 * trust model as cancelling. Returns `sharing: false` once the share was
 * stopped or the incident is no longer open, so the page stops sending.
 */
export async function updateSharedLocation(token: string, latitude: number, longitude: number) {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `select s.incident_id, s.stopped_at, s.last_shared_at, s.address_latitude, s.address_longitude, i.status
       from incident_location_shares s join incidents i on i.id = s.incident_id
       where s.token = $1 for update of s, i`,
      [token]
    );
    const share = rows[0];
    if (!share) throw AppError.notFound("Location sharing link not found", "LOCATION_SHARE_NOT_FOUND");
    if (share.stopped_at) return { sharing: false };
    if (!OPEN_STATUSES.includes(share.status)) {
      await client.query(`update incident_location_shares set stopped_at = now() where token = $1`, [token]);
      return { sharing: false };
    }

    await client.query(
      `update incident_location_shares set latitude = $2, longitude = $3, last_shared_at = now() where token = $1`,
      [token, latitude, longitude]
    );
    const incident = await loadIncident(client, share.incident_id);

    // Audit the start of sharing, not every ping.
    if (!share.last_shared_at) {
      await writeAuditLog({ action: "incident.live_location_started", entityType: "incident", entityId: share.incident_id });
    }
    realtimeBus.emit(RealtimeEvents.INCIDENT_LOCATION_UPDATED, { incident });
    return { sharing: true, share };
  });

  if (result.share) {
    const { address_latitude: lastLat, address_longitude: lastLng, incident_id: incidentId } = result.share;
    const moved = lastLat == null || lastLng == null || distanceMeters(lastLat, lastLng, latitude, longitude) > LIVE_ADDRESS_MOVE_METERS;
    if (moved) void fillLiveAddress(token, incidentId, latitude, longitude).catch((err) => logger.error({ err }, "incident.live_geocode_failed"));
  }
  return { sharing: result.sharing };
}

/** POST /api/qr/location/stop — the bystander chose to stop sharing. */
export async function stopSharedLocation(token: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `update incident_location_shares set stopped_at = coalesce(stopped_at, now()) where token = $1 returning incident_id`,
      [token]
    );
    if (!rows[0]) throw AppError.notFound("Location sharing link not found", "LOCATION_SHARE_NOT_FOUND");
    const incidentId = rows[0].incident_id;

    // incident_details works out whether anyone else is still sharing.
    const incident = await loadIncident(client, incidentId);
    await writeAuditLog({ action: "incident.live_location_stopped", entityType: "incident", entityId: incidentId });
    realtimeBus.emit(RealtimeEvents.INCIDENT_LOCATION_UPDATED, { incident });
    return { stopped: true };
  });
}

export interface CreateIncidentDirectInput {
  residentId: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
}

/**
 * POST /api/incidents/create — authenticated trigger path (e.g. a
 * guardian raising an alert for their ward from within the app,
 * without a physical QR scan). Reuses the same lifecycle as the QR
 * scan path from this point forward.
 */
export async function createIncidentDirect(input: CreateIncidentDirectInput, actor: AuthUser) {
  const result = await withTransaction(async (client) => {
    // Locking the resident serializes this with QR scans for the same
    // person, so two reports can't both open an alert at the same moment.
    const { rows: residentRows } = await client.query(
      `select id, barangay_id, guardian_id from residents where id = $1 for update`,
      [input.residentId]
    );
    const resident = residentRows[0];
    if (!resident) throw AppError.notFound("Resident not found", "RESIDENT_NOT_FOUND");

    const isGuardian = actor.role === "guardian" && actor.id === resident.guardian_id;
    const isBarangayStaff = (actor.role === "barangay_official" || actor.role === "barangay_responder") && actor.barangayId === resident.barangay_id;
    if (!isGuardian && !isBarangayStaff) {
      throw AppError.forbidden("You are not authorized to raise an alert for this resident", "INCIDENT_ACCESS_DENIED");
    }

    // Same rule as a QR scan: one open alert per resident.
    const existing = await findOpenIncident(client, input.residentId);
    if (existing) {
      const incident = await escalateFromRepeatReport(client, existing, { source: "app_direct_trigger", notes: input.notes, actor });
      return { incident, joined: true };
    }

    const { rows } = await client.query(
      `insert into incidents (resident_id, status, scan_latitude, scan_longitude, bystander_notes, timeout_at)
       values ($1, 'active', $2, $3, $4, now() + interval '1 minute' * $5)
       returning id`,
      [input.residentId, input.latitude ?? null, input.longitude ?? null, input.notes ?? null, env.incident.timeoutMinutes]
    );
    const incident = await loadIncident(client, rows[0].id);

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: "incident.created",
      entityType: "incident",
      entityId: incident.id,
      metadata: { residentId: input.residentId, source: "app_direct_trigger" },
    });

    if (resident.guardian_id && resident.guardian_id !== actor.id) {
      await sendPushNotification(resident.guardian_id, "Emergency Alert", "An emergency alert was raised for your ward.", { incidentId: incident.id });
    }
    await notifyBarangayOfficials(resident.barangay_id, incident.id);
    realtimeBus.emit(RealtimeEvents.INCIDENT_CREATED, { incident, barangayId: resident.barangay_id, guardianId: resident.guardian_id });
    return { incident, joined: false };
  });

  if (!result.joined) void fillScanAddress(result.incident.id, input.latitude, input.longitude).catch((err) => logger.error({ err }, "incident.scan_geocode_failed"));
  return result.incident;
}

async function notifyBarangayOfficials(barangayId: string, incidentId: string) {
  const { rows } = await pool.query(`select id from users where barangay_id = $1 and role = 'barangay_official' and is_active`, [barangayId]);
  await Promise.all(rows.map((u) => sendPushNotification(u.id, "New Emergency Alert", "A resident's QR was scanned in your barangay.", { incidentId })));
}

/**
 * GET /api/incidents/active — for the React Web dispatcher dashboard,
 * and the mobile app's Home screens (needs-attention lists, dashboard
 * counts). Defaults to only the still-open lifecycle statuses; pass
 * includeClosed for the Alert screen's "Closed" filter, which needs
 * confirmed_safe/resolved/closed incidents too.
 */
export async function listActiveIncidents(actor: AuthUser, options: { includeClosed?: boolean } = {}) {
  const params: unknown[] = [];
  let where = options.includeClosed ? `true` : `status in ('active','confirmed_not_safe','escalated','assigned')`;

  if (actor.role === "barangay_official" || actor.role === "barangay_responder") {
    params.push(actor.barangayId);
    where += ` and r.barangay_id = $${params.length}`;
  } else if (actor.role === "guardian") {
    params.push(actor.id);
    where += ` and r.guardian_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `select i.*, r.full_name as resident_name, r.home_address, r.photo_path as resident_photo_path,
            ar.full_name as assigned_responder_name, ar.photo_path as assigned_responder_photo_path,
            (select decision from incident_confirmations c where c.incident_id = i.id and c.source = 'guardian' order by c.created_at desc limit 1) as guardian_decision,
            (select decision from incident_confirmations c where c.incident_id = i.id and c.source = 'barangay_responder' and c.submitted_by = i.assigned_responder_id and c.created_at >= i.assigned_at order by c.created_at desc limit 1) as responder_decision
     from incident_details i
     join residents r on r.id = i.resident_id
     left join users ar on ar.id = i.assigned_responder_id
     where ${where}
     order by i.created_at desc`,
    params
  );
  return rows;
}

/**
 * Full incident history for one resident (every status, not just active)
 * — backs the "history" section on that resident's profile. Same access
 * rule as a single incident: barangay staff of that resident's barangay,
 * or the resident's own guardian.
 */
export async function listIncidentHistoryForResident(residentId: string, actor: AuthUser) {
  const { rows: residentRows } = await pool.query(`select barangay_id, guardian_id from residents where id = $1`, [residentId]);
  const resident = residentRows[0];
  if (!resident) throw AppError.notFound("Resident not found", "RESIDENT_NOT_FOUND");
  assertIncidentAccess(resident, actor);

  const { rows } = await pool.query(
    `select i.*,
            (select decision from incident_confirmations c where c.incident_id = i.id and c.source = 'guardian' order by c.created_at desc limit 1) as guardian_decision,
            (select decision from incident_confirmations c where c.incident_id = i.id and c.source = 'barangay_responder' and c.submitted_by = i.assigned_responder_id and c.created_at >= i.assigned_at order by c.created_at desc limit 1) as responder_decision
     from incident_details i
     where i.resident_id = $1
     order by i.created_at desc`,
    [residentId]
  );
  return rows;
}

export async function getIncidentById(incidentId: string, actor: AuthUser) {
  const { rows } = await pool.query(
    `select i.*, r.full_name as resident_name, r.medical_notes,
            r.home_address, r.photo_path as resident_photo_path,
            r.barangay_id, r.guardian_id, ar.full_name as assigned_responder_name, ar.photo_path as assigned_responder_photo_path,
            (select decision from incident_confirmations c where c.incident_id = i.id and c.source = 'guardian' order by c.created_at desc limit 1) as guardian_decision,
            (select decision from incident_confirmations c where c.incident_id = i.id and c.source = 'barangay_responder' and c.submitted_by = i.assigned_responder_id and c.created_at >= i.assigned_at order by c.created_at desc limit 1) as responder_decision
     from incident_details i
     join residents r on r.id = i.resident_id
     left join users ar on ar.id = i.assigned_responder_id
     where i.id = $1`,
    [incidentId]
  );
  const incident = rows[0];
  if (!incident) throw AppError.notFound("Incident not found", "INCIDENT_NOT_FOUND");
  assertIncidentAccess(incident, actor);
  return incident;
}

function assertIncidentAccess(incident: { barangay_id: string; guardian_id: string | null }, actor: AuthUser) {
  const isBarangayStaff = (actor.role === "barangay_official" || actor.role === "barangay_responder") && actor.barangayId === incident.barangay_id;
  const isGuardian = actor.role === "guardian" && actor.id === incident.guardian_id;
  if (!isBarangayStaff && !isGuardian) {
    throw AppError.forbidden("You do not have access to this incident", "INCIDENT_ACCESS_DENIED");
  }
}

async function lockedIncident(client: PoolClient, id: string) {
  // A view can't be locked; lock the core row, which every write path goes through.
  await client.query(`select id from incidents where id = $1 for update`, [id]);
  const { rows } = await client.query(`select i.*, r.guardian_id, r.barangay_id,
    (select decision from incident_confirmations c where c.incident_id=i.id and c.source='guardian' order by created_at desc limit 1) as guardian_decision,
    (select decision from incident_confirmations c where c.incident_id=i.id and c.source='barangay_responder'
      and c.submitted_by=i.assigned_responder_id and c.created_at >= i.assigned_at order by created_at desc limit 1) as responder_decision
    from incident_details i join residents r on r.id=i.resident_id where i.id=$1`, [id]);
  if (!rows[0]) throw AppError.notFound("Incident not found", "INCIDENT_NOT_FOUND");
  return rows[0];
}
async function lifecycleAudit(client: PoolClient, actor: AuthUser, id: string, action: string) {
  await client.query(`insert into audit_logs (actor_id,actor_role,action,entity_type,entity_id,metadata)
    values ($1,$2,$3,'incident',$4,'{}')`, [actor.id,actor.role,action,id]);
}

export async function submitConfirmation(incidentId: string, actor: AuthUser, decision: ConfirmationDecision, summaryNotes: string | undefined) {
  const { incident, discrepancy } = await withTransaction(async (client) => {
    const i = await lockedIncident(client, incidentId);
    if (['closed', 'resolved', 'cancelled'].includes(i.status)) throw AppError.conflict("This incident is already closed");
    const source = actor.role;
    if (source !== 'guardian' && source !== 'barangay_responder') throw AppError.forbidden("Only guardians or assigned responders can confirm");
    if (source === 'guardian' ? i.guardian_id !== actor.id : i.assigned_responder_id !== actor.id) throw AppError.forbidden("You are not assigned to this incident");
    const discrepancyBefore = hasDiscrepancy(i);
    await client.query(`insert into incident_confirmations (incident_id,source,submitted_by,decision,summary_notes)
      values ($1,$2,$3,$4,$5)`, [incidentId,source,actor.id,decision,summaryNotes ?? null]);
    i[source === 'guardian' ? 'guardian_decision' : 'responder_decision'] = decision;
    const status = i.guardian_decision === 'not_safe' || i.responder_decision === 'not_safe' ? 'confirmed_not_safe'
      : safetyConfirmed(i) && !guardianWaived(i) ? 'confirmed_safe'
      : i.status === 'escalated' ? 'escalated' : i.assigned_responder_id ? 'assigned' : 'active';
    await client.query(`update incidents set status=$1 where id=$2`, [status, incidentId]);
    // A Not Safe call reopens the responder's report for a new one.
    if (decision === 'not_safe') {
      await client.query(`update incident_responses set report_submitted_at = null where incident_id = $1`, [incidentId]);
    }
    await lifecycleAudit(client,actor,incidentId,'incident.confirmation_submitted');
    // Only worth a distinct alert the moment the two sides first disagree —
    // not on every later confirmation once it's already a known discrepancy.
    const discrepancy = !discrepancyBefore && hasDiscrepancy(i)
      ? { guardianId: i.guardian_id as string | null, responderId: i.assigned_responder_id as string | null, guardianSays: i.guardian_decision, responderSays: i.responder_decision }
      : null;
    return { incident: await loadIncident(client, incidentId), discrepancy };
  });

  if (discrepancy) {
    if (discrepancy.responderSays === 'not_safe' && discrepancy.guardianId) {
      // The on-site report leads: a guardian's remote "Safe" doesn't stand once the responder says otherwise.
      await sendPushNotification(discrepancy.guardianId, "Alert Still Active", "The responder on-site reported your ward as Not Safe despite an earlier Safe confirmation. The alert remains active.", { incidentId });
    } else if (discrepancy.guardianSays === 'not_safe' && discrepancy.responderId) {
      await sendPushNotification(discrepancy.responderId, "Please Re-Verify", "The guardian reported Not Safe after an earlier Safe confirmation on this alert. Please re-check the resident in person.", { incidentId });
    }
  }
  realtimeBus.emit(RealtimeEvents.INCIDENT_CONFIRMATION, { incident, decision, source: actor.role, submittedBy: actor.id });
  return incident;
}

/** [8C] Assigns Task & Sends Coordinates -> [12] Assigned Emergency Task. */
export async function assignResponder(incidentId: string, responderId: string, actor: AuthUser) {
  if (actor.role !== "barangay_official") {
    throw AppError.forbidden("Only barangay officials can assign responders", "FORBIDDEN_ROLE");
  }
  return withTransaction(async (client) => {
    const incident = await lockedIncident(client, incidentId);
    assertIncidentAccess(incident, actor);
    if (["closed", "resolved", "confirmed_safe", "cancelled"].includes(incident.status)) throw AppError.conflict("This incident is already closed");
    if (!incident) throw AppError.notFound("Incident not found", "INCIDENT_NOT_FOUND");

    const { rows: responderRows } = await client.query(
      `select id, barangay_id from users where id = $1 and role = 'barangay_responder' and is_active for update`,
      [responderId]
    );
    if (!responderRows[0]) throw AppError.badRequest("Responder not found or inactive", "RESPONDER_NOT_FOUND");
    if (responderRows[0].barangay_id !== actor.barangayId) {
      throw AppError.forbidden("Responder is not in your barangay", "BARANGAY_MISMATCH");
    }

    const coordinates = { lat: incident.scan_latitude, lng: incident.scan_longitude };
    await client.query(
      `update incidents set status = case when status in ('escalated','confirmed_not_safe') then status else 'assigned' end where id = $1`,
      [incidentId]
    );
    // (Re)assigning starts the response over: no report, reminder or
    // unreachable flag carries over from a previous responder.
    await client.query(
      `insert into incident_responses (incident_id, responder_id, assigned_by, assigned_at) values ($1, $2, $3, now())
       on conflict (incident_id) do update set
         responder_id = excluded.responder_id, assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at,
         reminded_at = null, unreachable_at = null, unreachable_reason = null,
         report_submitted_by = null, report_submitted_at = null, final_action_summary = null`,
      [incidentId, responderId, actor.id]
    );
    const updated = await loadIncident(client, incidentId);

    await writeAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: "incident.responder_assigned",
      entityType: "incident",
      entityId: incidentId,
      metadata: { responderId },
    });

    await sendPushNotification(responderId, "Emergency Task Assigned", "You have a new emergency task with location details.", {
      incidentId,
      coordinates,
    });
    realtimeBus.emit(RealtimeEvents.INCIDENT_ASSIGNED, { incident: updated, responderId });

    return updated;
  });
}

/** Save a responder report; no-guardian incidents remain active for official review. */
export async function resolveIncident(incidentId: string, actor: AuthUser, finalActionSummary: string) {
  if (actor.role !== 'barangay_responder') throw AppError.forbidden("Only the assigned responder can submit a report");
  const summary = finalActionSummary.trim();
  if (summary.length < 3 || summary.length > 2000) throw AppError.badRequest("Provide a report between 3 and 2,000 characters");
  const incident = await withTransaction(async client => {
    const i = await lockedIncident(client,incidentId);
    if (i.assigned_responder_id !== actor.id) throw AppError.forbidden("You are not the assigned responder");
    if (['closed', 'resolved', 'cancelled'].includes(i.status)) throw AppError.conflict("This incident is already closed");
    // Reports may document unsafe conditions, but can never bypass safety checks.
    const resolved = safetyConfirmed(i) && !guardianWaived(i);
    await client.query(`update incident_responses set final_action_summary=$1, report_submitted_by=$2, report_submitted_at=now()
      where incident_id=$3`, [summary, actor.id, incidentId]);
    if (resolved) {
      await client.query(`update incidents set status='resolved' where id=$1`, [incidentId]);
      await client.query(`insert into incident_outcomes (incident_id, resolved_by, resolved_at) values ($1, $2, now())
        on conflict (incident_id) do update set resolved_by = excluded.resolved_by, resolved_at = excluded.resolved_at`, [incidentId, actor.id]);
    } else {
      await client.query(`update incident_outcomes set resolved_by = null, resolved_at = null where incident_id = $1`, [incidentId]);
    }
    await lifecycleAudit(client,actor,incidentId,resolved ? 'incident.resolved' : 'incident.report_submitted');
    return loadIncident(client, incidentId);
  });
  realtimeBus.emit(RealtimeEvents.INCIDENT_STATUS_CHANGED, { incident });
  return incident;
}

export async function closeIncident(incidentId: string, actor: AuthUser) {
  if (actor.role !== 'barangay_official') throw AppError.forbidden("Only barangay officials can close an incident");
  const incident = await withTransaction(async client => {
    const i = await lockedIncident(client,incidentId);
    assertIncidentAccess(i,actor);
    if (['closed', 'cancelled'].includes(i.status)) throw AppError.conflict("This incident is already closed");
    if (!canCloseIncident(i)) throw AppError.conflict(!guardianWaived(i)
      ? "Guardian and assigned responder must both confirm Safe."
      : "The assigned responder must confirm Safe and submit a report. Any Not Safe concern must be resolved first.", 'CONFIRMATIONS_REQUIRED');
    await client.query(`update incidents set status='closed' where id=$1`, [incidentId]);
    await client.query(`insert into incident_outcomes (incident_id, closed_by, closed_at) values ($1, $2, now())
      on conflict (incident_id) do update set closed_by = excluded.closed_by, closed_at = excluded.closed_at`, [incidentId, actor.id]);
    await lifecycleAudit(client,actor,incidentId,'incident.closed');
    return loadIncident(client, incidentId);
  });
  realtimeBus.emit(RealtimeEvents.INCIDENT_STATUS_CHANGED, { incident });
  return incident;
}

/**
 * POST /api/qr/:token/cancel — public, unauthenticated, same trust model as
 * the scan itself: whoever holds the cancel_token issued at creation (i.e.
 * the same bystander session that raised it) can retract a false alarm
 * before anyone needs to act on it. Silently no-ops past the window or once
 * anyone has already engaged with the incident, rather than leaking which
 * case it is via an error message.
 */
export async function cancelIncidentFromScan(cancelToken: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `select i.id, i.resident_id from incident_cancellations c join incidents i on i.id = c.incident_id
       where c.cancel_token = $1 and c.cancellable_until > now() and i.status = 'active' for update of c, i`,
      [cancelToken]
    );
    if (!rows[0]) return false;
    await client.query(`update incidents set status = 'cancelled' where id = $1`, [rows[0].id]);
    await client.query(
      `update incident_cancellations set cancelled_at = now(), cancelled_reason = 'bystander_cancelled', cancel_token = null where incident_id = $1`,
      [rows[0].id]
    );
    const incident = await loadIncident(client, rows[0].id);
    await writeAuditLog({ action: "incident.cancelled", entityType: "incident", entityId: incident.id, metadata: { source: "bystander" } });
    const { rows: residentRows } = await client.query(`select guardian_id from residents where id = $1`, [incident.resident_id]);
    if (residentRows[0]?.guardian_id) {
      await sendPushNotification(residentRows[0].guardian_id, "Alert Cancelled", "A QR scan alert for your ward was cancelled by the person who scanned it — likely a false alarm.", { incidentId: incident.id });
    }
    realtimeBus.emit(RealtimeEvents.INCIDENT_STATUS_CHANGED, { incident });
    return true;
  });
}

/**
 * A barangay official or the assigned responder attests, with a reason,
 * that the guardian on file genuinely can't be reached for this incident —
 * distinct from silence: someone is accountable for the claim, it's logged,
 * and (unlike a resident with no guardian at all) an official still has to
 * review the responder's written report before closing it.
 */
export async function markGuardianUnreachable(incidentId: string, actor: AuthUser, reason: string) {
  const note = reason.trim();
  if (note.length < 3 || note.length > 500) throw AppError.badRequest("Provide a short reason (3-500 characters), e.g. what contact attempts were made.");
  const incident = await withTransaction(async (client) => {
    const i = await lockedIncident(client, incidentId);
    assertIncidentAccess(i, actor);
    if (actor.role !== 'barangay_official' && !(actor.role === 'barangay_responder' && i.assigned_responder_id === actor.id)) {
      throw AppError.forbidden("Only a barangay official or the assigned responder can mark the guardian unreachable");
    }
    if (!i.guardian_id) throw AppError.conflict("This resident has no guardian on file — nothing to mark unreachable");
    if (i.status === 'closed' || i.status === 'resolved' || i.status === 'cancelled') throw AppError.conflict("This incident is already closed");
    if (i.guardian_unreachable_at) throw AppError.conflict("Already marked unreachable for this incident");
    i.guardian_unreachable_at = new Date().toISOString();
    const status = i.responder_decision === 'not_safe' ? 'confirmed_not_safe'
      : i.status;
    await client.query(`update incidents set status = $1 where id = $2`, [status, incidentId]);
    await client.query(
      `insert into incident_guardian_followups (incident_id, unreachable_at, unreachable_by, unreachable_reason) values ($1, now(), $2, $3)
       on conflict (incident_id) do update set unreachable_at = excluded.unreachable_at,
         unreachable_by = excluded.unreachable_by, unreachable_reason = excluded.unreachable_reason`,
      [incidentId, actor.id, note]
    );
    await lifecycleAudit(client, actor, incidentId, 'incident.guardian_marked_unreachable');
    return loadIncident(client, incidentId);
  });
  realtimeBus.emit(RealtimeEvents.INCIDENT_STATUS_CHANGED, { incident });
  return incident;
}

/** The assigned responder flags that they physically can't get to the resident — an official needs to step in (manually reassign, dispatch another unit, etc). */
export async function markResponderUnreachableLocation(incidentId: string, actor: AuthUser, reason: string) {
  if (actor.role !== 'barangay_responder') throw AppError.forbidden("Only the assigned responder can report this");
  const note = reason.trim();
  if (note.length < 3 || note.length > 500) throw AppError.badRequest("Provide a short reason (3-500 characters), e.g. address inaccessible, resident not home.");
  const incident = await withTransaction(async (client) => {
    const i = await lockedIncident(client, incidentId);
    if (i.assigned_responder_id !== actor.id) throw AppError.forbidden("You are not the assigned responder");
    if (i.status === 'closed' || i.status === 'resolved' || i.status === 'cancelled') throw AppError.conflict("This incident is already closed");
    await client.query(
      `update incident_responses set unreachable_at = now(), unreachable_reason = $1 where incident_id = $2`,
      [note, incidentId]
    );
    await lifecycleAudit(client, actor, incidentId, 'incident.responder_unable_to_reach_location');
    return loadIncident(client, incidentId);
  });
  const { rows: officials } = await pool.query(
    `select u.id from users u join residents r on r.barangay_id = u.barangay_id
     where r.id = $1 and u.role = 'barangay_official' and u.is_active`,
    [incident.resident_id]
  );
  await Promise.all(officials.map((o) => sendPushNotification(o.id, "Responder Can't Reach Location", "The assigned responder reported they can't reach the resident's location. Reassignment may be needed.", { incidentId })));
  realtimeBus.emit(RealtimeEvents.INCIDENT_STATUS_CHANGED, { incident });
  return incident;
}

/**
 * Automated Timeout Engine: escalates any 'active' incident whose
 * timeout has elapsed with no confirmation. Intended to be invoked on
 * a fixed interval by src/jobs/timeout-engine.ts.
 */
export async function escalateTimedOutIncidents(): Promise<number> {
  // Skips no-guardian incidents whose assigned responder already reported
  // and whose latest responder confirmation is Safe: those wait for an
  // official's review, not escalation.
  const { rows: escalatedRows } = await pool.query(
    `update incidents i
     set status = 'escalated', escalated_at = now()
     where i.status in ('active','assigned') and i.timeout_at < now()
       and not (i.guardian_required = false and exists (
         select 1 from incident_responses r
         where r.incident_id = i.id and r.report_submitted_at is not null
           and exists (select 1 from incident_confirmations c where c.incident_id = i.id
             and c.source = 'barangay_responder' and c.submitted_by = r.responder_id
             and c.created_at >= r.assigned_at and c.decision = 'safe'
             and c.id = (select c2.id from incident_confirmations c2 where c2.incident_id = i.id
               and c2.source = 'barangay_responder' order by c2.created_at desc limit 1))))
     returning i.id`
  );
  const rows = await Promise.all(escalatedRows.map((row) => loadIncident(pool, row.id)));
  for (const incident of rows) {
    await writeAuditLog({ action: "incident.auto_escalated", entityType: "incident", entityId: incident.id });
    realtimeBus.emit(RealtimeEvents.INCIDENT_ESCALATED, { incident });

    const { rows: residentRows } = await pool.query(`select guardian_id, barangay_id from residents where id = $1`, [incident.resident_id]);
    const resident = residentRows[0];
    const { rows: confirmations } = await pool.query(
      `select source from incident_confirmations where incident_id = $1
       and (source = 'guardian' or (source = 'barangay_responder' and submitted_by = $2 and created_at >= $3))`,
      [incident.id, incident.assigned_responder_id, incident.assigned_at]
    );
    const guardianConfirmed = confirmations.some((c) => c.source === 'guardian');
    const responderConfirmed = confirmations.some((c) => c.source === 'barangay_responder');

    // Officials get the specific reason so they know what kind of follow-up
    // this needs — "no one has assigned a responder" and "the guardian is
    // silent" call for different action, not the same generic message.
    const reasonParts: string[] = [];
    if (incident.guardian_required && !guardianConfirmed) reasonParts.push("the guardian hasn't confirmed");
    if (!incident.assigned_responder_id) reasonParts.push("no responder has been assigned");
    else if (!responderConfirmed) reasonParts.push("the assigned responder hasn't confirmed");
    const reason = reasonParts.length ? reasonParts.join(" and ") : "confirmation is overdue";

    const { rows: officials } = await pool.query(
      `select u.id from users u where u.barangay_id = $1 and u.role = 'barangay_official' and u.is_active`,
      [resident?.barangay_id]
    );
    await Promise.all(
      officials.map((o) => sendPushNotification(o.id, "Alert Escalated", `An emergency alert was escalated: ${reason}.`, { incidentId: incident.id }))
    );
    if (incident.guardian_required && !guardianConfirmed && resident?.guardian_id) {
      await sendPushNotification(resident.guardian_id, "Response Needed", "You haven't confirmed your ward's safety yet — this alert has been escalated to barangay officials. Please respond as soon as you can.", { incidentId: incident.id });
    }
    if (incident.assigned_responder_id && !responderConfirmed) {
      await sendPushNotification(incident.assigned_responder_id, "Response Needed", "You haven't confirmed the resident's status yet — this assigned alert has been escalated to barangay officials.", { incidentId: incident.id });
    }
  }
  return rows.length;
}

/**
 * Nudges whoever hasn't responded yet, once at the halfway point of the
 * timeout window — most non-responses are a missed notification, not an
 * ignored one. Runs before escalation, and only reminds once per incident
 * (guardian_reminded_at / responder_reminded_at) so it isn't a repeat ping
 * every 30 seconds.
 */
export async function sendConfirmationReminders(): Promise<number> {
  const { rows: remindedGuardians } = await pool.query(
    `insert into incident_guardian_followups (incident_id, reminded_at)
     select i.id, now() from incidents i
     where i.status in ('active','assigned') and i.guardian_required = true
       and now() >= (i.timeout_at - interval '1 minute' * $1 / 2)
       and not exists (select 1 from incident_confirmations c where c.incident_id = i.id and c.source = 'guardian')
       and not exists (select 1 from incident_guardian_followups g where g.incident_id = i.id and g.reminded_at is not null)
     on conflict (incident_id) do update set reminded_at = excluded.reminded_at
     returning incident_id`,
    [env.incident.timeoutMinutes]
  );
  const { rows: guardianRows } = await pool.query(
    `select i.id, r.guardian_id from incidents i join residents r on r.id = i.resident_id where i.id = any($1::uuid[])`,
    [remindedGuardians.map((row) => row.incident_id)]
  );
  await Promise.all(
    guardianRows.filter((r) => r.guardian_id).map((r) =>
      sendPushNotification(r.guardian_id, "Reminder: Confirm Safety", "Please confirm whether your ward is safe — an emergency alert is still waiting on your response.", { incidentId: r.id })
    )
  );

  const { rows: responderRows } = await pool.query(
    `update incident_responses r set reminded_at = now()
     from incidents i
     where i.id = r.incident_id and i.status = 'assigned' and r.reminded_at is null
       and now() >= (i.timeout_at - interval '1 minute' * $1 / 2)
       and not exists (select 1 from incident_confirmations c where c.incident_id = i.id and c.source = 'barangay_responder'
         and c.submitted_by = r.responder_id and c.created_at >= r.assigned_at)
     returning r.incident_id as id, r.responder_id as assigned_responder_id`,
    [env.incident.timeoutMinutes]
  );
  await Promise.all(
    responderRows.map((r) =>
      sendPushNotification(r.assigned_responder_id, "Reminder: Confirm Status", "Please confirm the resident's safety status for your assigned emergency task.", { incidentId: r.id })
    )
  );

  return guardianRows.length + responderRows.length;
}

/**
 * Scenario: responder already confirmed Safe, but the guardian never
 * responds at all, even after escalation. Rather than leaving it stuck
 * forever, the system attests "guardian unreachable" on its own once a
 * generous grace period has passed — same accountable path as a human
 * marking it (guardian_unreachable_by stays null to show it was automatic),
 * and an official still has to review the report and tap Close themselves.
 */
export async function autoMarkUnreachableGuardiansAfterGracePeriod(): Promise<number> {
  const { rows: markedRows } = await pool.query(
    `insert into incident_guardian_followups (incident_id, unreachable_at, unreachable_reason)
     select i.id, now(), 'No response from the guardian within the extended grace period after escalation.'
     from incidents i join incident_responses r on r.incident_id = i.id
     where i.status = 'escalated' and i.guardian_required = true
       and i.escalated_at < now() - interval '1 minute' * $1
       and not exists (select 1 from incident_guardian_followups g where g.incident_id = i.id and g.unreachable_at is not null)
       and not exists (select 1 from incident_confirmations c where c.incident_id = i.id and c.source = 'guardian' and c.decision = 'not_safe')
       and exists (
         select 1 from incident_confirmations c where c.incident_id = i.id and c.source = 'barangay_responder'
           and c.submitted_by = r.responder_id and c.created_at >= r.assigned_at and c.decision = 'safe'
           and c.id = (select c2.id from incident_confirmations c2 where c2.incident_id = i.id and c2.source = 'barangay_responder' order by c2.created_at desc limit 1)
       )
     on conflict (incident_id) do update set unreachable_at = excluded.unreachable_at, unreachable_reason = excluded.unreachable_reason
     returning incident_id`,
    [env.incident.guardianGracePeriodMinutes]
  );
  const rows = await Promise.all(markedRows.map((row) => loadIncident(pool, row.incident_id)));
  for (const incident of rows) {
    await writeAuditLog({ action: "incident.guardian_auto_marked_unreachable", entityType: "incident", entityId: incident.id });
    realtimeBus.emit(RealtimeEvents.INCIDENT_STATUS_CHANGED, { incident });
    const { rows: officials } = await pool.query(
      `select u.id from users u join residents r on r.barangay_id = u.barangay_id
       where r.id = $1 and u.role = 'barangay_official' and u.is_active`,
      [incident.resident_id]
    );
    await Promise.all(
      officials.map((o) => sendPushNotification(o.id, "Guardian Unreachable", "The responder confirmed Safe and the guardian has not responded. Review the incident; a responder report is required before closure.", { incidentId: incident.id }))
    );
  }
  return rows.length;
}
