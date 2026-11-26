const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/services/api.js'), 'utf8');
let instance = 0;

async function withApi(responses, run, { initialStorage = new Map(), configured = true } = {}) {
  const envName = `__qralalayWebEnv${instance++}`;
  const previous = {
    env: globalThis[envName],
    fetch: globalThis.fetch,
    sessionStorage: globalThis.sessionStorage,
    crypto: globalThis.crypto,
  };
  const calls = [];
  const storage = new Map(initialStorage);
  globalThis[envName] = configured
    ? { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'placeholder-public-key' }
    : {};
  globalThis.crypto = webcrypto;
  globalThis.sessionStorage = {
    get length() { return storage.size; },
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
    key(index) { return [...storage.keys()][index] ?? null; },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected website API request');
    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      async json() { return next.body ?? { data: next.data }; },
    };
  };

  try {
    const transformed = source.replaceAll('import.meta.env', `globalThis.${envName}`);
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`;
    const { api } = await import(moduleUrl);
    return await run(api, calls, storage);
  } finally {
    globalThis[envName] = previous.env;
    globalThis.fetch = previous.fetch;
    globalThis.sessionStorage = previous.sessionStorage;
    globalThis.crypto = previous.crypto;
  }
}

function response(data) { return { data }; }

test('public QR lookup calls the public Edge Function with the publishable key', async () => {
  await withApi([response({ active: true, barangayName: 'Synthetic Barangay' })], async (api, calls) => {
    assert.deepEqual(await api.getPublicQrView('opaque-qr-token'), { active: true, barangayName: 'Synthetic Barangay' });
    assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/public-qr-view');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { token: 'opaque-qr-token' });
    assert.equal(calls[0].options.headers.apikey, 'placeholder-public-key');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer placeholder-public-key');
  });
});

test('public request retry reuses all capability keys and maps the Edge response', async () => {
  await withApi([
    response({ status: 'new', joinedExisting: false, requestToken: 'request-proof', cancellableUntil: '2030-01-01T00:00:00Z', locationToken: 'location-proof' }),
    response({ status: 'new', joinedExisting: true, requestToken: 'request-proof', cancellableUntil: '2030-01-01T00:00:00Z', locationToken: 'location-proof' }),
  ], async (api, calls, storage) => {
    const input = { bystanderNotes: 'Synthetic request', latitude: 14.5, longitude: 121.0, accuracyMeters: 6, locationDescription: 'Gate' };
    const first = await api.recordScanEvent('qr-token', input);
    const second = await api.recordScanEvent('qr-token', input);
    assert.deepEqual(first, {
      status: 'new', joined: false, cancelToken: 'request-proof',
      cancellableUntil: '2030-01-01T00:00:00Z', locationShareToken: 'location-proof',
    });
    assert.equal(second.joined, true);
    const firstBody = JSON.parse(calls[0].options.body);
    const retryBody = JSON.parse(calls[1].options.body);
    assert.deepEqual(retryBody, firstBody);
    assert.equal(firstBody.token, 'qr-token');
    assert.equal(firstBody.publicNote, input.bystanderNotes);
    assert.equal(firstBody.locationDescription, 'Gate');
    assert.ok(firstBody.idempotencyKey && firstBody.requestToken && firstBody.locationToken);
    assert.equal(storage.size, 1);
    assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/submit-assistance-request');
  });
});

test('cancelling a public request removes only the matching browser capability', async () => {
  const initialStorage = new Map([
    ['qralalay.public-request.qr-one', JSON.stringify({ requestToken: 'request-one', idempotencyKey: 'i1', locationToken: 'l1' })],
    ['qralalay.public-request.qr-two', JSON.stringify({ requestToken: 'request-two', idempotencyKey: 'i2', locationToken: 'l2' })],
  ]);
  await withApi([response({ cancelled: true })], async (api, calls, storage) => {
    assert.deepEqual(await api.cancelScan('request-one'), { cancelled: true });
    assert.equal(storage.has('qralalay.public-request.qr-one'), false);
    assert.equal(storage.has('qralalay.public-request.qr-two'), true);
    assert.deepEqual(JSON.parse(calls[0].options.body), { requestToken: 'request-one' });
    assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/cancel-assistance-request');
  }, { initialStorage });
});

test('temporary location sharing starts once, updates, stops, and can restart', async () => {
  await withApi([
    response({ sharing: true }), response({ sharing: true }), response({ sharing: true }),
    response({ ok: true }), response({ sharing: true }), response({ sharing: true }),
  ], async (api, calls) => {
    const position = { latitude: 14.5, longitude: 121.0, accuracy: 8 };
    await api.shareLocation('location-proof', position);
    await api.shareLocation('location-proof', position);
    await api.stopLocation('location-proof');
    await api.shareLocation('location-proof', position);
    assert.deepEqual(calls.map((call) => JSON.parse(call.options.body).action), ['start', 'update', 'update', 'stop', 'start', 'update']);
    assert.equal(JSON.parse(calls[1].options.body).accuracyMeters, 8);
    assert.equal(calls[0].url, 'https://example.supabase.co/functions/v1/location-share');
  });
});

test('public API preserves Edge Function error code and HTTP status', async () => {
  await withApi([{ ok: false, status: 429, body: { error: { message: 'rate limited', code: 'PUBLIC_RATE_LIMIT' } } }], async (api) => {
    await assert.rejects(api.getPublicQrView('qr-token'), (error) => {
      assert.equal(error.message, 'rate limited');
      assert.equal(error.code, 'PUBLIC_RATE_LIMIT');
      assert.equal(error.status, 429);
      return true;
    });
  });
});
