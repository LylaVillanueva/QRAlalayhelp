import { AppError } from "../utils/errors";
import type { AuthUser, UserRole } from "../types/domain";
import type { CreateAccountInput, UpdateAccountInput } from "../routes/schemas/account.schema";

// This interface lets the same service run against PostgreSQL or a test database.
export interface QueryClient { query(sql: string, values?: any[]): Promise<{ rows: any[] }>; }
export interface AccountDatabase extends QueryClient {
  transaction<T>(callback: (client: QueryClient) => Promise<T>): Promise<T>;
}
const ACTIVE_INCIDENTS = "('active','confirmed_not_safe','escalated','assigned')";
const ACCOUNT_SELECT = `select u.id, u.role, u.full_name, u.phone_number, u.email, u.position, u.home_address, u.photo_path,
  u.is_active, u.barangay_id, b.name as barangay_name,
  coalesce((select json_agg(r.id order by r.full_name) from residents r
    where r.guardian_id = u.id and r.is_active and r.resident_type in ('Senior Citizen','Person with Disability')), '[]') as ward_ids
  from users u left join barangays b on b.id = u.barangay_id`;

export function createAccountService(database: AccountDatabase) {
  function jurisdiction(actor: AuthUser) {
    if (actor.role !== 'barangay_official') throw AppError.forbidden('Only barangay officials can manage accounts.', 'FORBIDDEN_ROLE');
    if (!actor.barangayId) throw AppError.forbidden('Your account is not linked to a barangay.', 'NO_BARANGAY');
    return actor.barangayId;
  }
  async function read(client: QueryClient, id: string, barangayId: string) {
    const { rows } = await client.query(`${ACCOUNT_SELECT} where u.id = $1 and u.barangay_id = $2`, [id, barangayId]);
    if (!rows[0]) throw AppError.notFound('Account not found.', 'ACCOUNT_NOT_FOUND');
    return rows[0];
  }
  async function audit(client: QueryClient, actor: AuthUser, id: string, action: string, metadata: object = {}) {
    await client.query(`insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
      values ($1, $2, $3, 'user', $4, $5)`, [actor.id, actor.role, action, id, JSON.stringify(metadata)]);
  }
  async function translateConflict<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if ((error as { code?: string }).code === '23505') throw AppError.conflict('That phone number or email already belongs to an account.', 'IDENTIFIER_ALREADY_REGISTERED');
      throw error;
    }
  }
  async function lockScope(client: QueryClient, actor: AuthUser) {
    const barangayId = jurisdiction(actor);
    // Serialize administrative writes in a barangay, including simultaneous changes
    // to its last official. Recheck the actor after obtaining the lock.
    await client.query('select id from barangays where id = $1 for update', [barangayId]);
    const { rows } = await client.query('select role, is_active from users where id = $1 and barangay_id = $2 for update', [actor.id, barangayId]);
    if (!rows[0]?.is_active || rows[0].role !== 'barangay_official') throw AppError.forbidden('Your account can no longer manage users.', 'FORBIDDEN_ROLE');
    return barangayId;
  }
  async function lockedAccount(client: QueryClient, id: string, barangayId: string) {
    const { rows } = await client.query('select * from users where id = $1 and barangay_id = $2 for update', [id, barangayId]);
    if (!rows[0]) throw AppError.notFound('Account not found.', 'ACCOUNT_NOT_FOUND');
    return rows[0];
  }
  async function assertCanRestrict(client: QueryClient, target: any, actor: AuthUser) {
    if (target.id === actor.id) throw AppError.conflict('You cannot deactivate your own account or change your own role.', 'SELF_ACCESS_CHANGE');
    if (target.role === 'barangay_official' && target.is_active) {
      const { rows } = await client.query("select id from users where barangay_id = $1 and role = 'barangay_official' and is_active and id <> $2", [actor.barangayId, target.id]);
      if (!rows.length) throw AppError.conflict('Keep at least one active barangay official.', 'LAST_OFFICIAL');
    }
    if (target.role === 'guardian') {
      const { rows } = await client.query("select id from residents where guardian_id = $1 and is_active and resident_type in ('Senior Citizen','Person with Disability') limit 1", [target.id]);
      if (rows.length) throw AppError.conflict('Reassign this guardian’s wards before changing access.', 'GUARDIAN_HAS_WARDS');
    }
    if (target.role === 'barangay_responder') {
      const { rows } = await client.query(`select id from incidents i where i.status in ${ACTIVE_INCIDENTS}
        and exists (select 1 from incident_responses r where r.incident_id = i.id and r.responder_id = $1) limit 1`, [target.id]);
      if (rows.length) throw AppError.conflict('Reassign or resolve active incidents before changing this responder’s access.', 'RESPONDER_HAS_ASSIGNMENTS');
    }
  }
  async function revokeSessions(client: QueryClient, id: string) {
    await client.query('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [id]);
  }

  return {
    async list(actor: AuthUser) {
      const barangayId = jurisdiction(actor);
      const { rows } = await database.query(`${ACCOUNT_SELECT} where u.barangay_id = $1 order by u.full_name, u.id`, [barangayId]);
      return rows;
    },
    async create(input: CreateAccountInput, actor: AuthUser) {
      jurisdiction(actor);
      return translateConflict(() => database.transaction(async (client) => {
        const barangayId = await lockScope(client, actor);
        const ids = [...new Set(input.residentIds)];
        if (ids.length) {
          const { rows } = await client.query(`select id, guardian_id from residents where id = any($1::uuid[]) and barangay_id = $2
            and is_active and resident_type in ('Senior Citizen','Person with Disability') for update`, [ids, barangayId]);
          if (rows.length !== ids.length) throw AppError.badRequest('One or more wards are not available in your barangay.', 'INVALID_WARDS');
        }
        const { rows } = await client.query(`insert into users (full_name, phone_number, email, role, position, barangay_id, home_address)
          values ($1, $2, $3, $4, $5, $6, $7) returning id`, [input.fullName, input.phone || null, input.email || null,
          input.role, input.role === 'barangay_official' ? input.position || null : null, barangayId, input.homeAddress || null]);
        const id = rows[0].id;
        if (ids.length) {
          await client.query(`update residents set guardian_id = $1, guardian_relationship = $2
            where id = any($3::uuid[]) and barangay_id = $4`, [id, input.relationship || null, ids, barangayId]);
        }
        await audit(client, actor, id, 'user.created', { role: input.role, residentIds: ids });
        return read(client, id, barangayId);
      }));
    },
    async update(id: string, input: UpdateAccountInput, actor: AuthUser) {
      jurisdiction(actor);
      return translateConflict(() => database.transaction(async (client) => {
        const barangayId = await lockScope(client, actor);
        const target = await lockedAccount(client, id, barangayId);
        const phone = input.phone === undefined ? target.phone_number : input.phone;
        const email = input.email === undefined ? target.email : input.email;
        if (!phone && !email) throw AppError.badRequest('Keep a phone number or email for login.', 'IDENTIFIER_REQUIRED');
        await client.query(`update users set full_name = $1, phone_number = $2, email = $3, position = $4, home_address = $5
          where id = $6 and barangay_id = $7`, [input.fullName ?? target.full_name, phone, email,
          target.role === 'barangay_official' ? (input.position === undefined ? target.position : input.position) : null,
          input.homeAddress === undefined ? target.home_address : input.homeAddress, id, barangayId]);
        await audit(client, actor, id, 'user.updated', { fields: Object.keys(input) });
        return read(client, id, barangayId);
      }));
    },
    async changeRole(id: string, role: UserRole, position: string | null | undefined, actor: AuthUser) {
      jurisdiction(actor);
      return database.transaction(async (client) => {
        const barangayId = await lockScope(client, actor);
        const target = await lockedAccount(client, id, barangayId);
        if (target.role !== role) {
          await assertCanRestrict(client, target, actor);
          await revokeSessions(client, id);
        }
        await client.query('update users set role = $1, position = $2 where id = $3 and barangay_id = $4',
          [role, role === 'barangay_official' ? position ?? target.position : null, id, barangayId]);
        await audit(client, actor, id, 'user.role_changed', { previousRole: target.role, role });
        return read(client, id, barangayId);
      });
    },
    async setActive(id: string, isActive: boolean, actor: AuthUser) {
      jurisdiction(actor);
      return database.transaction(async (client) => {
        const barangayId = await lockScope(client, actor);
        const target = await lockedAccount(client, id, barangayId);
        if (target.is_active === isActive) return read(client, id, barangayId);
        if (!isActive) await assertCanRestrict(client, target, actor);
        await client.query('update users set is_active = $1 where id = $2 and barangay_id = $3', [isActive, id, barangayId]);
        await revokeSessions(client, id);
        await audit(client, actor, id, isActive ? 'user.activated' : 'user.deactivated');
        return read(client, id, barangayId);
      });
    },
  };
}
