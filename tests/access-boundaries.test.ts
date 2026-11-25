import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOtpSchema } from '../src/routes/schemas/auth.schema';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.DATABASE_URL = 'postgres://test:test@localhost/test';
process.env.JWT_ACCESS_SECRET = 'test-access';
process.env.JWT_REFRESH_SECRET = 'test-refresh';

test('public verification rejects self-provisioned staff accounts', () => {
  const request = { channel: 'email', identifier: 'test@example.com', otp: '123456', device: { deviceId: 'test-device', platform: 'android' } };
  assert.equal(verifyOtpSchema.safeParse(request).success, true);
  assert.equal(verifyOtpSchema.safeParse({ ...request, signup: { fullName: 'Test', role: 'barangay_official' } }).success, false);
});

test('authenticated incident views never expose public cancellation credentials', async () => {
  const { incidentView } = await import('../src/controllers/incident.controller');
  assert.deepEqual(incidentView({ id: 'incident', status: 'active', cancel_token: 'private' }), { id: 'incident', status: 'active' });
});

test('a duplicate scanner joins and escalates the open incident without its cancellation credential', async t => {
  const { pool } = await import('../src/db/pool');
  const { createIncidentFromScan } = await import('../src/services/incident.service');
  const existing = { id: 'incident', status: 'active', cancel_token: 'private', cancellable_until: new Date() };
  const statements: string[] = [];
  let current: any = existing;
  t.mock.method(pool, 'query', async () => ({ rows: [] }) as any);
  t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql: string) {
    statements.push(sql);
    if (sql.includes('from qr_tokens qt')) return { rows: [{ token: 'qr', status: 'active', resident_id: 'resident' }] };
    if (sql.startsWith('select id from incidents where resident_id')) return { rows: [{ id: existing.id }] };
    if (sql.includes('from incident_details')) return { rows: [current] };
    if (sql.includes('update incidents set')) { current = { ...existing, status: 'escalated', report_count: 2 }; return { rows: [] }; }
    return { rows: [] };
  } }) as any);
  const result = await createIncidentFromScan({ qrToken: 'qr' });
  assert.equal(result.id, existing.id);
  assert.equal(result.status, 'escalated');
  assert.equal(result.cancel_token, null);
  assert.equal(result.cancellable_until, null);
  assert.equal(existing.cancel_token, 'private');
  assert.ok(!statements.some((sql) => sql.includes('insert into incidents')), 'no second incident is opened');
});

test('incident updates reach only their barangay and guardian and exclude cancellation credentials', async t => {
  const { pool } = await import('../src/db/pool');
  const { publishIncident } = await import('../src/sockets');
  t.mock.method(pool, 'query', async () => ({ rows: [{ barangay_id: 'local', guardian_id: 'guardian' }] }) as any);
  const sent: any[] = [];
  const io = { to(rooms: string[]) { return { emit(event: string, data: unknown) { sent.push({ rooms, event, data }); } }; } } as any;
  await publishIncident(io, 'incident:updated', { id: 'incident', resident_id: 'resident', cancel_token: 'private' });
  assert.deepEqual(sent, [{ rooms: ['barangay:local', 'guardian:guardian'], event: 'incident:updated', data: { id: 'incident', resident_id: 'resident' } }]);
});

test('QR revocation requires an official and scopes the write to their barangay', async t => {
  const { pool } = await import('../src/db/pool');
  const { revokeQrToken } = await import('../src/services/qr.service');
  const calls: any[] = [];
  t.mock.method(pool, 'connect', async () => ({
    release() {},
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  }) as any);
  await assert.rejects(revokeQrToken('token', { role: 'guardian' } as any), /Only barangay officials/);
  assert.equal(calls.length, 0);
  await assert.rejects(revokeQrToken('foreign-token', { role: 'barangay_official', barangayId: 'local' } as any), /not found/);
  const update = calls.find(({ sql }) => sql.includes('update qr_tokens'));
  assert.ok(update);
  assert.match(update.sql, /r.barangay_id = \$2/);
  assert.deepEqual(update.params, ['foreign-token', 'local']);
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
});

test('public QR lookup returns only barangay context and rejects inactive residents', async t => {
  const { pool } = await import('../src/db/pool');
  const { getPublicQrView } = await import('../src/services/qr.service');
  let row: any = { status: 'active', is_active: true, barangay_name: 'Synthetic Barangay' };
  let statement = '';
  t.mock.method(pool, 'query', async (sql: string) => {
    statement = sql;
    return { rows: [row] } as any;
  });

  assert.deepEqual(await getPublicQrView('synthetic-token'), { barangayName: 'Synthetic Barangay' });
  assert.doesNotMatch(statement, /full_name|medical_notes|phone_number|home_address|select\s+\*/i);
  assert.match(statement, /r\.is_active/);

  row = { status: 'active', is_active: false, barangay_name: 'Synthetic Barangay' };
  await assert.rejects(getPublicQrView('synthetic-token'), /not active/i);
});

test('public scan result omits internal incident identifiers', async () => {
  const { publicScanResultView } = await import('../src/controllers/qr.controller');
  const result = publicScanResultView({
    id: 'internal-incident-id',
    status: 'active',
    cancel_token: 'request-owned-cancel-token',
    cancellable_until: '2026-11-24T12:00:00Z',
    location_share_token: 'request-owned-location-token',
  } as any);
  assert.deepEqual(result, {
    status: 'active',
    cancelToken: 'request-owned-cancel-token',
    cancellableUntil: '2026-11-24T12:00:00Z',
    locationShareToken: 'request-owned-location-token',
  });
  assert.equal('incidentId' in result, false);
});
