import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountService, type AccountDatabase } from '../src/services/account-management';
import { createAccountSchema, updateAccountSchema } from '../src/routes/schemas/account.schema';
import type { AuthUser } from '../src/types/domain';

const actor: AuthUser = { id: 'official', role: 'barangay_official', fullName: 'Official', phoneNumber: null, email: 'official@example.test', barangayId: 'barangay-a', barangayName: 'A' };
function fixture(options: { target?: any; wards?: any[]; assignments?: any[]; insertError?: object } = {}) {
  const calls: { sql: string; values: any[] }[] = [];
  let committed = false;
  const target = options.target ?? { id: 'target', role: 'guardian', is_active: true, phone_number: '+639171234567' };
  const db: AccountDatabase = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith('select role, is_active')) return { rows: [{ role: actor.role, is_active: true }] };
      if (sql.startsWith('select * from users')) return { rows: options.target === null ? [] : [target] };
      if (sql.startsWith('select id from residents') || sql.startsWith('select id, guardian_id')) return { rows: options.wards ?? [] };
      if (sql.startsWith('select id from incidents')) return { rows: options.assignments ?? [] };
      if (sql.startsWith('insert into users')) { if (options.insertError) throw options.insertError; return { rows: [{ id: 'new-user' }] }; }
      if (sql.includes('from users u left join')) return { rows: [target] };
      return { rows: [] };
    },
    async transaction(callback) { const value = await callback(db); committed = true; return value; },
  };
  return { service: createAccountService(db), calls, committed: () => committed };
}

test('schemas require a login identifier and reject role injection through profile updates', () => {
  assert.equal(createAccountSchema.safeParse({ fullName: 'New User', role: 'guardian' }).success, false);
  assert.equal(updateAccountSchema.safeParse({ role: 'barangay_official' }).success, false);
  assert.equal(createAccountSchema.safeParse({ fullName: 'New User', role: 'barangay_responder', email: 'user@example.test', residentIds: ['00000000-0000-4000-8000-000000000001'] }).success, false);
});

test('listing accounts is restricted to the official’s barangay', async () => {
  const f = fixture();
  await f.service.list(actor);
  assert.match(f.calls[0].sql, /where u.barangay_id = \$1/);
  assert.deepEqual(f.calls[0].values, ['barangay-a']);
  await assert.rejects(f.service.list({ ...actor, role: 'guardian' }), { code: 'FORBIDDEN_ROLE' });
});

test('foreign or missing targets are rejected before any update', async () => {
  const f = fixture({ target: null });
  await assert.rejects(f.service.update('foreign-user', { fullName: 'Changed' }, actor), { code: 'ACCOUNT_NOT_FOUND' });
  assert.deepEqual(f.calls.find(c => c.sql.startsWith('select *'))?.values, ['foreign-user', 'barangay-a']);
  assert.equal(f.calls.some(c => c.sql.startsWith('update ')), false);
  assert.equal(f.committed(), false);
});

test('an official cannot deactivate their own account', async () => {
  const f = fixture({ target: { id: actor.id, role: actor.role, is_active: true } });
  await assert.rejects(f.service.setActive(actor.id, false, actor), { code: 'SELF_ACCESS_CHANGE' });
  assert.equal(f.committed(), false);
});

test('guardian wards and active responder assignments prevent access removal', async () => {
  const guardian = fixture({ wards: [{ id: 'ward' }] });
  await assert.rejects(guardian.service.setActive('target', false, actor), { code: 'GUARDIAN_HAS_WARDS' });
  const responder = fixture({ target: { id: 'target', role: 'barangay_responder', is_active: true }, assignments: [{ id: 'incident' }] });
  await assert.rejects(responder.service.changeRole('target', 'guardian', null, actor), { code: 'RESPONDER_HAS_ASSIGNMENTS' });
});

test('successful deactivation revokes sessions and audits within the transaction', async () => {
  const f = fixture();
  await f.service.setActive('target', false, actor);
  assert.equal(f.committed(), true);
  assert.ok(f.calls.some(c => c.sql.startsWith('update refresh_tokens') && c.values[0] === 'target'));
  assert.ok(f.calls.some(c => c.sql.startsWith('insert into audit_logs') && c.values[2] === 'user.deactivated'));
});

test('invalid wards stop account creation before an insert', async () => {
  const f = fixture();
  await assert.rejects(f.service.create({ fullName: 'Guardian', phone: '+639171234567', role: 'guardian', residentIds: ['foreign-ward'] }, actor), { code: 'INVALID_WARDS' });
  assert.equal(f.calls.some(c => c.sql.startsWith('insert into users')), false);
});

test('duplicate login identifiers return a conflict without committing', async () => {
  const f = fixture({ insertError: { code: '23505' } });
  await assert.rejects(f.service.create({ fullName: 'Guardian', phone: '+639171234567', role: 'guardian', residentIds: [] }, actor), { code: 'IDENTIFIER_ALREADY_REGISTERED' });
  assert.equal(f.committed(), false);
});

test('an account update cannot remove its last login identifier', async () => {
  const f = fixture();
  await assert.rejects(f.service.update('target', { phone: null, email: null }, actor), { code: 'IDENTIFIER_REQUIRED' });
  assert.equal(f.committed(), false);
});
