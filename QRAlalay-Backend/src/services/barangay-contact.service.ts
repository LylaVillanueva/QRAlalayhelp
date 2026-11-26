import { AppError } from "../utils/errors";
import type { AuthUser } from "../types/domain";
import { withTransaction } from "../db/pool";

function official(actor: AuthUser) {
  if (actor.role !== "barangay_official" || !actor.barangayId) {
    throw AppError.forbidden("Only a barangay official can manage public contact numbers.", "FORBIDDEN_ROLE");
  }
  return actor.barangayId;
}

export async function listBarangayContacts(actor: AuthUser) {
  if (!actor.barangayId) return [];
  const includeUnverified = actor.role === "barangay_official";
  const { rows } = await withTransaction(async (client) => client.query(
    `select id,label,phone,availability,is_primary,is_active,verified_at
       from barangay_contacts
      where barangay_id=$1 and ($2::boolean or (is_active and verified_by is not null and verified_at is not null))
      order by is_primary desc,label`, [actor.barangayId, includeUnverified],
  ));
  return rows;
}

export async function saveBarangayContact(input: {
  id?: string | null; label: string; phone: string; availability?: string | null; isPrimary?: boolean;
}, actor: AuthUser) {
  const barangayId = official(actor);
  return withTransaction(async (client) => {
    await client.query("select id from barangays where id=$1 for update", [barangayId]);
    const { rows: currentActor } = await client.query(
      "select role,is_active from users where id=$1 and barangay_id=$2 for update", [actor.id, barangayId],
    );
    if (!currentActor[0]?.is_active || currentActor[0].role !== "barangay_official") {
      throw AppError.forbidden("Your account can no longer manage barangay contacts.", "FORBIDDEN_ROLE");
    }
    let phoneChanged = false;
    if (input.id) {
      const { rows: current } = await client.query(
        "select phone from barangay_contacts where id=$1 and barangay_id=$2 for update", [input.id,barangayId],
      );
      if (!current[0]) throw AppError.notFound("Contact not found in your barangay.", "CONTACT_NOT_FOUND");
      phoneChanged = current[0].phone !== input.phone;
      if (input.isPrimary) {
        await client.query("update barangay_contacts set is_primary=false where barangay_id=$1 and id<>$2 and is_primary", [barangayId,input.id]);
      }
    }
    let result: any[];
    if (!input.id) {
      ({ rows: result } = await client.query(
        `insert into barangay_contacts(barangay_id,label,phone,availability,is_primary)
         values($1,$2,$3,$4,$5) returning id,label,phone,availability,is_primary,is_active,verified_at`,
        [barangayId,input.label,input.phone,input.availability || null,Boolean(input.isPrimary)],
      ));
    } else {
      ({ rows: result } = await client.query(
        `update barangay_contacts set label=$3, phone=$4, availability=$5, is_primary=$6,
            is_active=case when phone is distinct from $4 then false else is_active end,
            verified_by=case when phone is distinct from $4 then null else verified_by end,
            verified_at=case when phone is distinct from $4 then null else verified_at end
          where id=$1 and barangay_id=$2
          returning id,label,phone,availability,is_primary,is_active,verified_at`,
        [input.id,barangayId,input.label,input.phone,input.availability || null,Boolean(input.isPrimary)],
      ));
      if (!result[0]) throw AppError.notFound("Contact not found in your barangay.", "CONTACT_NOT_FOUND");
    }
    const row = result[0];
    await client.query(`insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,metadata)
      values($1,$2,$3,'barangay_contact',$4,$5)`, [actor.id,actor.role,
      input.id ? "barangay_contact.updated" : "barangay_contact.created",row.id,
      JSON.stringify({ verified: Boolean(row.is_active), phoneChanged })]);
    return row;
  });
}

export async function verifyBarangayContact(contactId: string, confirmed: boolean, actor: AuthUser) {
  const barangayId = official(actor);
  return withTransaction(async (client) => {
    await client.query("select id from barangays where id=$1 for update", [barangayId]);
    const { rows: currentActor } = await client.query(
      "select role,is_active from users where id=$1 and barangay_id=$2 for update", [actor.id, barangayId],
    );
    if (!currentActor[0]?.is_active || currentActor[0].role !== "barangay_official") {
      throw AppError.forbidden("Your account can no longer manage barangay contacts.", "FORBIDDEN_ROLE");
    }
    if (confirmed) {
      await client.query(`update barangay_contacts set is_primary=false where barangay_id=$1 and id<>$2
        and is_primary and exists(select 1 from barangay_contacts target where target.id=$2 and target.is_primary)`, [barangayId,contactId]);
    }
    const { rows } = await client.query(
      `update barangay_contacts set is_active=$3,verified_by=case when $3 then $4 else null end,
         verified_at=case when $3 then now() else null end
       where id=$1 and barangay_id=$2 returning id`, [contactId,barangayId,Boolean(confirmed),actor.id],
    );
    if (!rows[0]) throw AppError.notFound("Contact not found in your barangay.", "CONTACT_NOT_FOUND");
    await client.query(`insert into audit_logs(actor_id,actor_role,action,entity_type,entity_id,metadata)
      values($1,$2,'barangay_contact.verification_changed','barangay_contact',$3,$4)`,
      [actor.id,actor.role,contactId,JSON.stringify({ active: Boolean(confirmed) })]);
    return true;
  });
}
