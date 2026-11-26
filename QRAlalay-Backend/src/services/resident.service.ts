import type { PoolClient } from "pg";
import { pool, withTransaction } from "@/db/pool";
import { AppError } from "@/utils/errors";
import { writeAuditLog } from "@/services/audit.service";
import type { AuthUser } from "@/types/domain";

export interface NewGuardianInput {
  fullName: string;
  relation: string;
  phone?: string;
  email?: string;
}

const RESIDENT_TYPE_CODES: Record<string, string> = {
  "Senior Citizen": "SC",
  "Person with Disability": "PWD",
};

export interface EnrollResidentInput {
  fullName: string;
  residentType?: string;
  dateOfBirth?: string;
  medicalNotes?: string;
  homeAddress?: string;
  guardianId?: string;
  newGuardian?: NewGuardianInput;
}

/**
 * Rejects a "new guardian" whose phone/email already belongs to any
 * account — guardian or otherwise. Enrolling a second ward under the
 * same guardian must go through the "existing guardian" picker instead,
 * so this account creation path stays a hard uniqueness check.
 */
async function findOrCreateGuardianAccount(db: Pick<PoolClient, "query">, newGuardian: NewGuardianInput, barangayId: string): Promise<string> {
  for (const [column, value] of [
    ["phone_number", newGuardian.phone],
    ["email", newGuardian.email],
  ] as const) {
    if (!value) continue;
    const { rows } = await db.query(`select id, role from users where ${column} = $1`, [value]);
    if (rows[0]) {
      throw AppError.conflict(
        rows[0].role === "guardian"
          ? "This phone number or email already belongs to a registered guardian. Please select \"Existing guardian\" instead."
          : "This phone number or email is already registered under a different account type.",
        "IDENTIFIER_ALREADY_REGISTERED"
      );
    }
  }

  try {
    const { rows: created } = await db.query(
      `insert into users (role, full_name, phone_number, email, barangay_id) values ('guardian', $1, $2, $3, $4) returning id`,
      [newGuardian.fullName, newGuardian.phone ?? null, newGuardian.email ?? null, barangayId]
    );
    return created[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw AppError.conflict("That phone number or email was just registered. Refresh the guardian list and try again.", "IDENTIFIER_ALREADY_REGISTERED");
    }
    throw error;
  }
}

/** [2] Resident Enrolment Profile Data — barangay official only. */
export async function enrollResident(input: EnrollResidentInput, actor: AuthUser) {
  if (actor.role !== "barangay_official") {
    throw AppError.forbidden("Only barangay officials can enroll residents", "FORBIDDEN_ROLE");
  }
  if (!actor.barangayId) throw AppError.badRequest("Your account is not linked to a barangay", "NO_BARANGAY");

  return withTransaction(async (client) => {
    let guardianId = input.guardianId ?? null;
    if (input.guardianId) {
      const { rows } = await client.query(
        `select id from users where id = $1 and role = 'guardian' and (barangay_id = $2 or barangay_id is null) for update`,
        [input.guardianId, actor.barangayId]
      );
      if (!rows[0]) throw AppError.badRequest("guardianId does not reference a guardian account available to your barangay", "INVALID_GUARDIAN");
    } else if (input.newGuardian) {
      guardianId = await findOrCreateGuardianAccount(client, input.newGuardian, actor.barangayId!);
    }

    // The code column is unique. Serialize allocation so simultaneous
    // enrollments cannot both choose the same count + 1 value.
    let residentCode: string | null = null;
    if (input.residentType) {
      const typeCode = RESIDENT_TYPE_CODES[input.residentType] ?? "GEN";
      const year = new Date().getFullYear();
      const sequenceLock = `resident-code:${input.residentType}:${year}`;
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [sequenceLock]);
      const { rows: countRows } = await client.query(
        `select count(*)::int as count from residents where resident_type = $1 and extract(year from created_at) = $2`,
        [input.residentType, year]
      );
      const sequence = countRows[0].count + 1;
      residentCode = `BRC-${typeCode}-${year}-${String(sequence).padStart(4, "0")}`;
    }

    const { rows } = await client.query(
      `insert into residents (full_name, resident_type, resident_code, date_of_birth, medical_notes, home_address, guardian_id, enrolled_by, barangay_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [
        input.fullName,
        input.residentType ?? null,
        residentCode,
        input.dateOfBirth ?? null,
        input.medicalNotes ?? null,
        input.homeAddress ?? null,
        guardianId,
        actor.id,
        actor.barangayId,
      ]
    );

    await client.query(
      `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id)
       values ($1, $2, 'resident.enrolled', 'resident', $3)`,
      [actor.id, actor.role, rows[0].id]
    );
    return rows[0];
  });
}

/**
 * Registered guardian accounts available to link a resident to — backs
 * the "existing guardian" picker shown when enrolling a senior/PWD
 * resident. A resident only ever has one guardian_id (this is what makes
 * it safe to reassign in listResidents/enrollResident above), but a
 * guardian can be linked to any number of residents, so no such
 * uniqueness constraint applies here.
 * Favors the official's own barangay but includes guardians with no
 * barangay set, since that field isn't reliably populated at signup.
 */
export async function listGuardians(actor: AuthUser) {
  if (actor.role !== "barangay_official") {
    throw AppError.forbidden("Only barangay officials can list guardians", "FORBIDDEN_ROLE");
  }

  const { rows } = await pool.query(
    `select id, full_name, phone_number, email, photo_path from users
     where role = 'guardian' and (barangay_id = $1 or barangay_id is null)
     order by full_name asc`,
    [actor.barangayId]
  );
  return rows;
}

export interface RegisterGuardianInput {
  fullName: string;
  phone?: string;
  email?: string;
  residentIds?: string[];
}

/**
 * Registers a guardian account directly (not as a side effect of
 * enrolling a resident) and optionally reassigns existing residents to
 * it in the same step — backs the "Guardian" resident-type flow, where
 * an official signs up a guardian and picks their wards from residents
 * already on file. Same hard-uniqueness rule on phone/email as
 * findOrCreateGuardianAccount.
 */
export async function registerGuardianWithWards(input: RegisterGuardianInput, actor: AuthUser) {
  if (actor.role !== "barangay_official") {
    throw AppError.forbidden("Only barangay officials can register guardians", "FORBIDDEN_ROLE");
  }
  if (!actor.barangayId) throw AppError.badRequest("Your account is not linked to a barangay", "NO_BARANGAY");

  const ids = [...new Set(input.residentIds ?? [])];
  try {
    return await withTransaction(async (client) => {
      if (ids.length) {
        const { rows: wards } = await client.query(
          `select id from residents where id = any($1::uuid[]) and barangay_id = $2 and is_active for update`,
          [ids, actor.barangayId]
        );
        if (wards.length !== ids.length) throw AppError.badRequest("One or more residents are not available in your barangay.", "INVALID_WARDS");
      }

      const guardianId = await findOrCreateGuardianAccount(
        client,
        { fullName: input.fullName, relation: "", phone: input.phone, email: input.email },
        actor.barangayId!
      );
      if (ids.length) {
        await client.query(`update residents set guardian_id = $1 where id = any($2::uuid[]) and barangay_id = $3`, [guardianId, ids, actor.barangayId]);
      }
      await client.query(
        `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
         values ($1, $2, 'guardian.registered', 'user', $3, $4)`,
        [actor.id, actor.role, guardianId, JSON.stringify({ wardCount: ids.length })]
      );
      const { rows } = await client.query(`select id, full_name, phone_number, email from users where id = $1`, [guardianId]);
      return rows[0];
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw AppError.conflict("That phone number or email is already registered.", "IDENTIFIER_ALREADY_REGISTERED");
    }
    throw error;
  }
}

/**
 * Active barangay_responder accounts in the official's own barangay —
 * backs the "assign responder" picker on an alert. Strictly same-barangay
 * (unlike listGuardians above), matching assignResponder's own check.
 */
export async function listResponders(actor: AuthUser) {
  if (actor.role !== "barangay_official") {
    throw AppError.forbidden("Only barangay officials can list responders", "FORBIDDEN_ROLE");
  }

  const { rows } = await pool.query(
    `select id, full_name, phone_number, email, photo_path from users
     where role = 'barangay_responder' and barangay_id = $1 and is_active
     order by full_name asc`,
    [actor.barangayId]
  );
  return rows;
}

/**
 * For a barangay official: every active resident in their own barangay
 * (backs the "assign wards" picker — includes residents who already have
 * a guardian, since a resident only ever has one guardian_id and picking
 * one there reassigns it). For a guardian: only their own wards. For a
 * responder: only residents from incidents that have been assigned to
 * them — they don't enroll residents, so there's no barangay-wide list.
 */
export async function listResidents(actor: AuthUser) {
  if (actor.role === "guardian") {
    const { rows } = await pool.query(
      `select id, full_name, resident_type, resident_code, date_of_birth, guardian_id, photo_path from residents
       where guardian_id = $1 and is_active = true
       order by full_name asc`,
      [actor.id]
    );
    return rows;
  }

  if (actor.role === "barangay_responder") {
    const { rows } = await pool.query(
      `select distinct r.id, r.full_name, r.resident_type, r.resident_code, r.date_of_birth, r.guardian_id, r.photo_path,
              u.full_name as guardian_name,
              (r.guardian_id is not null and exists(select 1 from refresh_tokens rt where rt.user_id = r.guardian_id)) as guardian_has_logged_in
       from residents r
       join incidents i on i.resident_id = r.id
       join incident_responses ir on ir.incident_id = i.id
       left join users u on u.id = r.guardian_id
       where ir.responder_id = $1 and r.is_active = true
       order by r.full_name asc`,
      [actor.id]
    );
    return rows;
  }

  if (actor.role !== "barangay_official") {
    throw AppError.forbidden("Only barangay officials, responders, and guardians can list residents", "FORBIDDEN_ROLE");
  }
  if (!actor.barangayId) throw AppError.badRequest("Your account is not linked to a barangay", "NO_BARANGAY");

  const { rows } = await pool.query(
    `select r.id, r.full_name, r.resident_type, r.resident_code, r.date_of_birth, r.guardian_id, r.photo_path,
            u.full_name as guardian_name,
            (r.guardian_id is not null and exists(select 1 from refresh_tokens rt where rt.user_id = r.guardian_id)) as guardian_has_logged_in
     from residents r
     left join users u on u.id = r.guardian_id
     where r.barangay_id = $1 and r.is_active = true
     order by r.full_name asc`,
    [actor.barangayId]
  );
  return rows;
}

export async function getResidentProfile(residentId: string, actor: AuthUser) {
  const { rows } = await pool.query(
    `select r.*,
            u.full_name as guardian_name,
            u.phone_number as guardian_phone,
            u.email as guardian_email,
            (r.guardian_id is not null and exists(select 1 from refresh_tokens rt where rt.user_id = r.guardian_id)) as guardian_has_logged_in
     from residents r
     left join users u on u.id = r.guardian_id
     where r.id = $1`,
    [residentId]
  );
  const resident = rows[0];
  if (!resident) throw AppError.notFound("Resident not found", "RESIDENT_NOT_FOUND");

  const isBarangayStaff = (actor.role === "barangay_official" || actor.role === "barangay_responder") && actor.barangayId === resident.barangay_id;
  const isGuardian = actor.role === "guardian" && actor.id === resident.guardian_id;
  if (!isBarangayStaff && !isGuardian) throw AppError.forbidden("Access denied", "RESIDENT_ACCESS_DENIED");

  return resident;
}

export interface UpdateResidentInput extends Partial<EnrollResidentInput> {}

/** GET/PUT /api/users/profile counterpart for the resident's information. */
export async function updateResidentProfile(residentId: string, input: UpdateResidentInput, actor: AuthUser) {
  const resident = await getResidentProfile(residentId, actor);
  // Guardians may update notes/contact info; only barangay officials
  // may change enrolment/administrative fields (address, guardian link).
  const isGuardian = actor.role === "guardian" && actor.id === resident.guardian_id;
  const isOfficial = actor.role === "barangay_official" && actor.barangayId === resident.barangay_id;
  if (!isGuardian && !isOfficial) throw AppError.forbidden("Access denied", "RESIDENT_ACCESS_DENIED");

  if (input.guardianId) {
    const { rows } = await pool.query("select id from users where id=$1 and role='guardian'", [input.guardianId]);
    if (!rows[0]) throw AppError.badRequest("Guardian must reference a guardian account", "INVALID_GUARDIAN");
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const guardianEditable: (keyof UpdateResidentInput)[] = ["medicalNotes"];
  const officialOnly: (keyof UpdateResidentInput)[] = ["fullName", "dateOfBirth", "homeAddress", "guardianId"];

  const columnMap: Record<string, string> = {
    fullName: "full_name",
    dateOfBirth: "date_of_birth",
    medicalNotes: "medical_notes",
    homeAddress: "home_address",
    guardianId: "guardian_id",
  };

  const allowedKeys = isOfficial ? [...guardianEditable, ...officialOnly] : guardianEditable;

  for (const key of allowedKeys) {
    if (input[key] === undefined) continue;
    const column = columnMap[key];
    fields.push(`${column} = $${i++}`);
    values.push(input[key]);
  }

  if (fields.length === 0) return resident;

  values.push(residentId);
  const { rows } = await pool.query(`update residents set ${fields.join(", ")} where id = $${i} returning *`, values);

  await writeAuditLog({ actorId: actor.id, actorRole: actor.role, action: "resident.updated", entityType: "resident", entityId: residentId, metadata: { fields: allowedKeys.filter((k) => input[k] !== undefined) } });
  return rows[0];
}
