import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.DATABASE_URL = "postgres://test:test@localhost/test";
process.env.JWT_ACCESS_SECRET = "test-access";
process.env.JWT_REFRESH_SECRET = "test-refresh";

const official = { id: "official-1", role: "barangay_official", barangayId: "barangay-1" } as any;

function transactionClient(handler: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> | { rows: any[] }) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    release() {},
    async query(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      return await handler(sql, params);
    },
  };
  return { client, statements };
}

test("contact writes require an official and scope existing-contact lookup to their barangay", async (t) => {
  const { pool } = await import("../src/db/pool");
  const contacts = await import("../src/services/barangay-contact.service");
  const tx = transactionClient((sql) => {
    if (sql.includes("select role,is_active from users")) return { rows: [{ role: "barangay_official", is_active: true }] };
    if (sql.includes("select phone from barangay_contacts")) return { rows: [] };
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => tx.client as any);

  await assert.rejects(
    contacts.saveBarangayContact({ id: "contact-1", label: "Hotline", phone: "+6321234567" }, { id: "guardian-1", role: "guardian", barangayId: "barangay-1" } as any),
    /Only a barangay official/,
  );
  assert.equal(tx.statements.length, 0, "unauthorized roles do not open a transaction");

  await assert.rejects(
    contacts.saveBarangayContact({ id: "contact-1", label: "Hotline", phone: "+6321234567" }, official),
    /Contact not found in your barangay/,
  );
  const lookup = tx.statements.find(({ sql }) => sql.includes("select phone from barangay_contacts"));
  assert.deepEqual(lookup?.params, ["contact-1", "barangay-1"]);
  assert.ok(tx.statements.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(tx.statements.some(({ sql }) => sql.startsWith("update barangay_contacts")), false);
});

test("changing a contact phone clears verification and records the accurate audit metadata", async (t) => {
  const { pool } = await import("../src/db/pool");
  const contacts = await import("../src/services/barangay-contact.service");
  const tx = transactionClient((sql) => {
    if (sql.includes("select role,is_active from users")) return { rows: [{ role: "barangay_official", is_active: true }] };
    if (sql.includes("select phone from barangay_contacts")) return { rows: [{ phone: "+6321111111" }] };
    if (sql.startsWith("update barangay_contacts set")) return { rows: [{ id: "contact-1", label: "Hotline", phone: "+6322222222", is_active: false, verified_at: null }] };
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => tx.client as any);

  const row = await contacts.saveBarangayContact({ id: "contact-1", label: "Hotline", phone: "+6322222222" }, official);
  assert.equal(row.is_active, false);
  assert.equal(row.verified_at, null);
  const update = tx.statements.find(({ sql }) => sql.startsWith("update barangay_contacts set"));
  assert.match(update!.sql, /is_active=case when phone is distinct from \$4 then false else is_active end/);
  assert.match(update!.sql, /verified_at=case when phone is distinct from \$4 then null else verified_at end/);
  const audit = tx.statements.find(({ sql }) => sql.includes("insert into audit_logs"));
  assert.ok(audit);
  assert.deepEqual(JSON.parse(String(audit.params[4])), { verified: false, phoneChanged: true });
  assert.ok(tx.statements.some(({ sql }) => sql === "COMMIT"));
});

test("verification is barangay-scoped and writes confirmation audit metadata", async (t) => {
  const { pool } = await import("../src/db/pool");
  const contacts = await import("../src/services/barangay-contact.service");
  const tx = transactionClient((sql) => {
    if (sql.includes("select role,is_active from users")) return { rows: [{ role: "barangay_official", is_active: true }] };
    if (sql.startsWith("update barangay_contacts set is_primary=false")) return { rows: [] };
    if (sql.startsWith("update barangay_contacts set is_active=")) return { rows: [{ id: "contact-1" }] };
    return { rows: [] };
  });
  t.mock.method(pool, "connect", async () => tx.client as any);

  assert.equal(await contacts.verifyBarangayContact("contact-1", true, official), true);
  const activation = tx.statements.find(({ sql }) => sql.startsWith("update barangay_contacts set is_active="));
  assert.deepEqual(activation?.params, ["contact-1", "barangay-1", true, "official-1"]);
  const audit = tx.statements.find(({ sql }) => sql.includes("insert into audit_logs"));
  assert.deepEqual(JSON.parse(String(audit?.params[3])), { active: true });
  assert.ok(tx.statements.some(({ sql }) => sql === "COMMIT"));
});
