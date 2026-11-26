import test from 'node:test';
import assert from 'node:assert/strict';

// Prevent these tests from ever opening the configured application database.
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.DATABASE_URL = 'postgres://test:test@localhost/test';
process.env.JWT_ACCESS_SECRET = 'test-access';
process.env.JWT_REFRESH_SECRET = 'test-refresh';

const official = { id: 'official', role: 'barangay_official', barangayId: 'local' } as any;
const responder = { id: 'responder', role: 'barangay_responder', barangayId: 'local' } as any;
const base = { id: 'incident', status: 'assigned', barangay_id: 'local', guardian_required: false,
  assigned_responder_id: 'responder', responder_decision: 'safe', guardian_decision: null,
  report_submitted_by: 'responder', report_submitted_at: new Date(), final_action_summary: 'Checked and safe' };

test('incident lifecycle authorization and transactional closure', async t => {
  const { pool } = await import('../src/db/pool');
  const { closeIncident, resolveIncident, submitConfirmation } = await import('../src/services/incident.service');
  let incident: any;
  let commands: string[];
  t.mock.method(pool, 'query', async () => { throw new Error('Unexpected nontransactional database access'); });
  t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql: string, params: any[] = []) {
    commands.push(sql);
    // Reads go through the incident_details view (migration 014).
    if (sql.includes('from incident_details')) return { rows: [{ ...incident }] };
    if (sql.startsWith('update incidents')) {
      if (sql.includes("status='closed'")) incident.status = 'closed';
      else if (sql.includes("status='resolved'")) incident.status = 'resolved';
      else if (sql.includes('status=$1')) incident.status = params[0];
      return { rows: [] };
    }
    if (sql.startsWith('update incident_responses set final_action_summary=$1')) incident.final_action_summary = params[0];
    return { rows: [] };
  } }));
  for (const [name, overrides, actor] of [
    ['missing report', { report_submitted_at: null }, official],
    ['Not Safe', { responder_decision: 'not_safe' }, official],
    ['foreign official', {}, { ...official, barangayId: 'foreign' }],
    ['responder cannot approve', {}, responder],
    ['unreachable guardian', { guardian_required: true }, official],
  ] as const) {
    await t.test(name, async () => {
      incident = { ...base, ...overrides }; commands = [];
      await assert.rejects(closeIncident('incident', actor));
      assert.equal(commands.some(sql => sql.startsWith('update incidents')), false);
      assert.equal(commands.includes('COMMIT'), false);
    });
  }
  await t.test('official approval commits closure and audit together', async () => {
    incident = { ...base }; commands = [];
    assert.equal((await closeIncident('incident', official)).status, 'closed');
    assert.ok(commands.some(sql => sql.includes('insert into audit_logs')));
    assert.equal(commands.at(-1), 'COMMIT');
  });
  await t.test('no-guardian report never resolves incident automatically', async () => {
    incident = { ...base }; commands = [];
    assert.equal((await resolveIncident('incident', responder, 'Checked and safe')).status, 'assigned');
  });
  await t.test('report cannot bypass pending guardian or Not Safe', async () => {
    for (const overrides of [{ guardian_required: true }, { responder_decision: 'not_safe', status: 'confirmed_not_safe' }]) {
      incident = { ...base, ...overrides }; commands = [];
      assert.notEqual((await resolveIncident('incident', responder, 'Documented response')).status, 'resolved');
    }
  });
  await t.test('responder Safe without guardian stays assigned', async () => {
    incident = { ...base, responder_decision: null }; commands = [];
    assert.equal((await submitConfirmation('incident', responder, 'safe', undefined)).status, 'assigned');
  });
  await t.test('unreachable guardian requires official closure after the report', async () => {
    incident = { ...base, guardian_required: true, guardian_unreachable_at: new Date() }; commands = [];
    assert.equal((await resolveIncident('incident', responder, 'Checked and safe')).status, 'assigned');
    assert.equal((await closeIncident('incident', official)).status, 'closed');
  });
  await t.test('cancelled incidents reject confirmations, reports, and closure', async () => {
    for (const action of [
      () => submitConfirmation('incident', responder, 'safe', undefined),
      () => resolveIncident('incident', responder, 'Checked and safe'),
      () => closeIncident('incident', official),
    ]) {
      incident = { ...base, status: 'cancelled' }; commands = [];
      await assert.rejects(action, /already closed/);
      assert.equal(commands.some(sql => sql.startsWith('update incidents')), false);
    }
  });
  await t.test('guardian Safe without assigned responder does not close', async () => {
    incident = { ...base, guardian_required: true, guardian_id: 'guardian', assigned_responder_id: null, responder_decision: null }; commands = [];
    assert.equal((await submitConfirmation('incident', { id: 'guardian', role: 'guardian' } as any, 'safe', undefined)).status, 'active');
  });
});
