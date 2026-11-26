const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '../services/supabaseApi.js');
const apiSource = fs.readFileSync(sourcePath, 'utf8');
let moduleNumber = 0;

function asModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

async function loadSupabaseApi(fixture) {
  const fixtureKey = `__qralalaySupabaseApiFixture${moduleNumber++}`;
  globalThis[fixtureKey] = fixture;
  const injected = apiSource
    .replace("import { supabase } from './supabase';", `const { supabase } = globalThis.${fixtureKey};`)
    .replace("import { getExpoPushToken } from './notifications';", `const { getExpoPushToken } = globalThis.${fixtureKey};`)
    .replace("import { sessionStorage } from './sessionStorage';", `const { sessionStorage } = globalThis.${fixtureKey};`);
  return import(asModule(injected));
}

function fixture() {
  const calls = [];
  return {
    calls,
    getExpoPushToken: async () => null,
    sessionStorage: {
      async getItem() { return null; },
      async setItem() {},
      async removeItem() {},
    },
    supabase: {
      functions: {
        async invoke(name, options) {
          calls.push({ name, options });
          return { data: { data: options.body?.email
            ? { profileId: 'profile-123', invitationSent: true }
            : { profileId: 'profile-123', invitationSent: false, phoneVerificationRequired: true } }, error: null };
        },
      },
      auth: {
        async verifyOtp() { return { data: { session: { access_token: 'access', refresh_token: 'refresh' } }, error: null }; },
        async getUser() { return { data: { user: { id: 'auth-123', email: null } }, error: null }; },
        async signOut() { return { error: null }; },
      },
      async rpc(name, args) {
        calls.push({ rpc: name, args });
        if (name === 'get_my_profile_with_photos') return { data: [{
          profile_id: 'profile-123', role: 'guardian', full_name: 'Guardian Example', is_active: true,
        }], error: null };
        return { data: true, error: null };
      },
    },
  };
}

test('Supabase adapter implements every mobile API method', async () => {
  const { supabaseApi } = await loadSupabaseApi(fixture());
  const apiText = fs.readFileSync(path.join(__dirname, '../services/api.js'), 'utf8');
  const legacyApi = apiText.match(/const legacyApi = \{([\s\S]*?)\n\};/)[1];
  const methodNames = [...legacyApi.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*(?:\(|:)/gm)].map((match) => match[1]);
  const missing = methodNames.filter((name) => !(name in supabaseApi));
  assert.deepEqual(missing, []);
});

test('registerGuardian sends a scoped Auth invitation and returns the legacy-shaped profile', async () => {
  const mock = fixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  const result = await supabaseApi.registerGuardian({
    fullName: 'Guardian Example',
    email: 'guardian@example.test',
    phone: '+639171234567',
    residentIds: ['resident-123'],
    relationship: 'Parent',
  });

  assert.deepEqual(mock.calls, [{
    name: 'invite-account',
    options: { body: {
      email: 'guardian@example.test',
      fullName: 'Guardian Example',
      phone: '+639171234567',
      role: 'guardian',
      wardIds: ['resident-123'],
      relationship: 'Parent',
      position: null,
      homeAddress: null,
    } },
  }]);
  assert.deepEqual(result, {
    id: 'profile-123',
    profileId: 'profile-123',
    full_name: 'Guardian Example',
    phone_number: '+639171234567',
    email: 'guardian@example.test',
    invitationSent: true,
    phoneVerificationRequired: false,
  });
});

test('phone-only guardian registration creates a pending phone-verification invitation', async () => {
  const mock = fixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  const result = await supabaseApi.registerGuardian({ fullName: 'Guardian Example', phone: '+639171234567' });
  assert.equal(result.profileId, 'profile-123');
  assert.equal(result.invitationSent, false);
  assert.equal(result.phoneVerificationRequired, true);
  assert.deepEqual(mock.calls[0], { name: 'invite-account', options: { body: {
    email: null,
    fullName: 'Guardian Example',
    phone: '+639171234567',
    role: 'guardian',
    wardIds: [],
    relationship: null,
    position: null,
    homeAddress: null,
  } } });
});

test('phone OTP verifies and claims the phone invitation before loading the profile', async () => {
  const mock = fixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  const result = await supabaseApi.verifyOtp({ channel: 'phone', identifier: '+639171234567', otp: '123456' });
  assert.equal(result.user.id, 'profile-123');
  assert.deepEqual(mock.calls.filter((call) => call.rpc).map((call) => call.rpc), [
    'claim_phone_invitation',
    'get_my_profile_with_photos',
  ]);
});

test('revokeQr calls the protected QR revocation RPC with card ID and reason', async () => {
  const mock = fixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  assert.equal(await supabaseApi.revokeQr({ id: 'card-1' }, 'lost card'), true);
  assert.deepEqual(mock.calls[0], {
    rpc: 'revoke_qr_card',
    args: { p_card_id: 'card-1', p_reason: 'lost card' },
  });
  await assert.rejects(() => supabaseApi.revokeQr({ token: 'opaque-token' }), /QR card ID is not available/);
});

test('barangay contact adapter uses scoped list, save, and official confirmation RPCs', async () => {
  const mock = fixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  mock.supabase.rpc = async (name, args) => {
    mock.calls.push({ rpc: name, args });
    if (name === 'list_my_barangay_contacts') return { data: [{
      contact_id: 'contact-1', label: 'Barangay Hotline', phone: '+639171234567', availability: '24 hours',
      is_primary: true, is_active: true, verified_at: '2026-11-25T00:00:00Z',
    }], error: null };
    return { data: name === 'save_barangay_contact' ? 'contact-1' : true, error: null };
  };

  assert.deepEqual(await supabaseApi.listBarangayContacts(), [{
    id: 'contact-1', label: 'Barangay Hotline', phone: '+639171234567', availability: '24 hours',
    isPrimary: true, isActive: true, verifiedAt: '2026-11-25T00:00:00Z',
  }]);
  assert.equal(await supabaseApi.saveBarangayContact({ id: null, label: 'Barangay Hotline', phone: '+639171234567', isPrimary: true }), 'contact-1');
  assert.equal(await supabaseApi.verifyBarangayContact('contact-1', true), true);
  assert.deepEqual(mock.calls.filter((call) => call.rpc).map(({ rpc, args }) => [rpc, args]), [
    ['list_my_barangay_contacts', {}],
    ['save_barangay_contact', { p_contact_id: null, p_label: 'Barangay Hotline', p_phone: '+639171234567', p_availability: null, p_is_primary: true }],
    ['verify_barangay_contact', { p_contact_id: 'contact-1', p_confirmed: true }],
  ]);
});

test('printable QR card includes the QR image but omits resident personal information', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/qrCardHtml.js'), 'utf8');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const { buildQrCardHtml } = await import(moduleUrl);
  const html = buildQrCardHtml('data:image/png;base64,SGVsbG8=');
  assert.match(html, /QRAlalay/);
  assert.match(html, /data:image\/png;base64,SGVsbG8=/);
  assert.doesNotMatch(html, /resident|address|guardian|birth date/i);
  assert.throws(() => buildQrCardHtml('https://example.test/qr.png'), /valid QR image/);
});

test('private Realtime profile subscription forwards data-free invalidations and removes its channel', async () => {
  const mock = fixture();
  let broadcastHandler;
  let removedChannel;
  const channel = {
    on(type, filter, handler) {
      assert.equal(type, 'broadcast');
      assert.deepEqual(filter, { event: 'case_event' });
      broadcastHandler = handler;
      return this;
    },
    subscribe() { return this; },
  };
  mock.supabase.channel = (topic, options) => {
    assert.equal(topic, 'qralalay:profile:profile-123');
    assert.deepEqual(options, { config: { private: true } });
    return channel;
  };
  mock.supabase.removeChannel = async (value) => { removedChannel = value; };
  const { supabaseApi } = await loadSupabaseApi(mock);
  let received;
  const unsubscribe = supabaseApi.subscribeToUpdates('profile-123', (payload) => { received = payload; });
  const payload = { eventId: 'event-1', eventType: 'case.updated', caseId: 'case-1' };
  broadcastHandler({ payload });
  assert.deepEqual(received, payload);
  unsubscribe();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removedChannel, channel);
});

function caseFixture({ assignmentStatus = null, responderId = null } = {}) {
  const mock = fixture();
  const rpc = mock.supabase.rpc;
  mock.supabase.storage = { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) };
  mock.supabase.rpc = async (name, args) => {
    if (name === 'get_assistance_case') { mock.calls.push({ rpc: name, args }); return { data: [{ case_id: 'case-1', status: 'in_progress', version: 4 }], error: null }; }
    if (name === 'list_assistance_cases') return { data: [{ case_id: 'case-1', status: 'in_progress', version: 4,
      assigned_responder_id: responderId, assignment_id: responderId ? 'asg-1' : null, assignment_status: assignmentStatus }], error: null };
    if (name === 'list_accessible_case_responder_photos') return { data: [], error: null };
    return rpc(name, args);
  };
  return mock;
}

test('assigning a case without an active assignment uses assign_responder', async () => {
  const mock = caseFixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  await supabaseApi.assignResponder('case-1', 'resp-2');
  const call = mock.calls.find((item) => item.rpc === 'assign_responder');
  assert.deepEqual(call.args, { p_case_id: 'case-1', p_responder_id: 'resp-2', p_expected_version: 4 });
});

test('replacing a pending or accepted responder uses reassign_responder with a reason', async () => {
  for (const status of ['pending_acceptance', 'accepted']) {
    const mock = caseFixture({ assignmentStatus: status, responderId: 'resp-1' });
    const { supabaseApi } = await loadSupabaseApi(mock);
    await assert.rejects(() => supabaseApi.assignResponder('case-1', 'resp-2'), /reason is required/);
    await assert.rejects(() => supabaseApi.assignResponder('case-1', 'resp-1', 'same person'), /already assigned/);
    await supabaseApi.assignResponder('case-1', 'resp-2', '  Cannot reach the area  ');
    assert.equal(mock.calls.some((item) => item.rpc === 'assign_responder'), false);
    const call = mock.calls.find((item) => item.rpc === 'reassign_responder');
    assert.deepEqual(call.args, { p_case_id: 'case-1', p_responder_id: 'resp-2', p_reason: 'Cannot reach the area', p_expected_version: 4 });
  }
});

test('a declined assignment can be assigned again without a reason', async () => {
  // Declined assignments are not returned as active by list_assistance_cases.
  const mock = caseFixture({ assignmentStatus: null, responderId: null });
  const { supabaseApi } = await loadSupabaseApi(mock);
  await supabaseApi.assignResponder('case-1', 'resp-2');
  assert.ok(mock.calls.some((item) => item.rpc === 'assign_responder'));
});

test('a new guardian is invited and linked as pending; nothing is verified automatically', async () => {
  const mock = fixture();
  const rpc = mock.supabase.rpc;
  mock.supabase.rpc = async (name, args) => {
    if (name === 'create_resident_with_birth_date') { mock.calls.push({ rpc: name, args }); return { data: 'res-1', error: null }; }
    if (name === 'create_guardian_link') { mock.calls.push({ rpc: name, args }); return { data: 'link-1', error: null }; }
    return rpc(name, args);
  };
  const { supabaseApi } = await loadSupabaseApi(mock);
  await supabaseApi.enrollResident({
    fullName: 'Fictional Resident', residentType: 'Senior Citizen', guardianVerifiedByOfficial: true,
    newGuardian: { fullName: 'Fictional Guardian', email: 'guardian@example.test', relation: 'Child' },
  });
  const invite = mock.calls.find((item) => item.name === 'invite-account');
  assert.equal('wardIds' in invite.options.body, false);
  const link = mock.calls.find((item) => item.rpc === 'create_guardian_link');
  assert.deepEqual(link.args, { p_resident_id: 'res-1', p_guardian_profile_id: 'profile-123', p_relationship: 'Child' });
  assert.equal(mock.calls.some((item) => item.rpc === 'review_guardian_link'), false);
});

test('an existing guardian is linked as pending; nothing is verified automatically', async () => {
  const mock = fixture();
  const rpc = mock.supabase.rpc;
  mock.supabase.rpc = async (name, args) => {
    if (name === 'create_resident_with_birth_date') return { data: 'res-2', error: null };
    if (name === 'create_guardian_link') { mock.calls.push({ rpc: name, args }); return { data: 'link-2', error: null }; }
    return rpc(name, args);
  };
  const { supabaseApi } = await loadSupabaseApi(mock);
  await supabaseApi.enrollResident({ fullName: 'Fictional Resident', guardianId: 'guardian-9', relationship: 'Spouse', guardianVerifiedByOfficial: true });
  assert.ok(mock.calls.some((item) => item.rpc === 'create_guardian_link'));
  assert.equal(mock.calls.some((item) => item.rpc === 'review_guardian_link'), false);
});

test('verifying a guardian relationship requires the official\'s own reason', async () => {
  const mock = fixture();
  const { supabaseApi } = await loadSupabaseApi(mock);
  await assert.rejects(() => supabaseApi.verifyGuardianLink('link-1', '  '), /Record how/);
  assert.equal(mock.calls.some((item) => item.rpc === 'review_guardian_link'), false);
  await supabaseApi.verifyGuardianLink('link-1', '  Checked barangay ID in person ');
  const call = mock.calls.find((item) => item.rpc === 'review_guardian_link');
  assert.deepEqual(call.args, { p_link_id: 'link-1', p_decision: 'verified', p_reason: 'Checked barangay ID in person' });
});

function exportFixture(status, body) {
  const mock = fixture();
  mock.supabase.functions.invoke = async (name, options) => {
    mock.calls.push({ name, options });
    if (status === 200) return { data: { data: body }, error: null };
    return { data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } } };
  };
  return mock;
}

test('QR re-export returns the existing card and never issues a replacement', async () => {
  const mock = exportFixture(200, { cardId: 'card-1', publicUrl: 'https://www.qralalay.app/scan/abc' });
  const { supabaseApi } = await loadSupabaseApi(mock);
  const card = await supabaseApi.exportExistingQr({ cardId: 'card-1' });
  assert.deepEqual(card, { id: 'card-1', publicUrl: 'https://www.qralalay.app/scan/abc', publicScanUrl: 'https://www.qralalay.app/scan/abc' });
  assert.deepEqual(mock.calls.map((call) => [call.name, call.options.body]), [['export-qr-card', { cardId: 'card-1' }]]);
});

test('QR re-export failures are reported separately and never replace the card', async () => {
  const cases = [
    [409, { error: { code: 'QR_EXPORT_UNAVAILABLE', message: 'This QR card predates secure re-export.' } }, 'QR_EXPORT_UNAVAILABLE'],
    [404, { error: { code: 'QR_CARD_NOT_FOUND', message: 'The active QR card was not found.' } }, 'QR_CARD_NOT_FOUND'],
    [404, { code: 'NOT_FOUND', message: 'Requested function was not found' }, 'BACKEND_UPDATE_PENDING'],
  ];
  for (const [status, body, code] of cases) {
    const mock = exportFixture(status, body);
    const { supabaseApi } = await loadSupabaseApi(mock);
    await assert.rejects(() => supabaseApi.exportExistingQr({ cardId: 'card-1' }), (error) => error.code === code);
    assert.deepEqual(mock.calls.map((call) => call.name), ['export-qr-card']);
  }
});

test('a new guardian without an email is refused but the resident is kept', async () => {
  const mock = fixture();
  const rpc = mock.supabase.rpc;
  mock.supabase.rpc = async (name, args) => (name === 'create_resident_with_birth_date' ? { data: 'res-9', error: null } : rpc(name, args));
  const { supabaseApi } = await loadSupabaseApi(mock);
  await assert.rejects(
    () => supabaseApi.enrollResident({ fullName: 'Fictional Resident', newGuardian: { fullName: 'No Email', phone: '+639170000000' } }),
    (error) => error.residentId === 'res-9' && /email address/.test(error.message),
  );
  assert.equal(mock.calls.some((item) => item.name === 'invite-account'), false);
});

test('resident history translates backend statuses for the alert stages', async () => {
  const mock = fixture();
  mock.supabase.rpc = async () => ({ data: [
    { case_id: 'c1', status: 'new' }, { case_id: 'c2', status: 'in_progress' }, { case_id: 'c3', status: 'closed' },
  ], error: null });
  const { supabaseApi } = await loadSupabaseApi(mock);
  const history = await supabaseApi.listResidentHistory('res-1');
  assert.deepEqual(history.map((row) => [row.id, row.status]), [['c1', 'active'], ['c2', 'assigned'], ['c3', 'closed']]);
});

test('an invalid or revoked QR card shows the server message, not a generic HTTP error', async () => {
  const mock = fixture();
  mock.supabase.functions.invoke = async () => ({ data: null, error: {
    message: 'Edge Function returned a non-2xx status code',
    context: { status: 404, json: async () => ({ error: { code: 'QR_NOT_ACTIVE', message: 'This QR code is not available.' } }) },
  } });
  const { supabaseApi } = await loadSupabaseApi(mock);
  await assert.rejects(() => supabaseApi.getPublicQrView('revoked-token'), (error) => error.code === 'QR_NOT_ACTIVE' && error.message === 'This QR code is not available.');
});

test('an unregistered sign-in email is answered like a registered one', async () => {
  const mock = fixture();
  mock.supabase.auth.signInWithOtp = async () => ({ error: { message: 'Signups not allowed for otp', status: 422 } });
  const { supabaseApi } = await loadSupabaseApi(mock);
  assert.deepEqual(await supabaseApi.sendOtp({ channel: 'email', identifier: 'unknown@example.test' }), { sent: true });
  mock.supabase.auth.signInWithOtp = async () => ({ error: { message: 'Email rate limit exceeded', status: 429 } });
  await assert.rejects(() => supabaseApi.sendOtp({ channel: 'email', identifier: 'someone@example.test' }), /rate limit/);
});

test('a bystander request sends the landmark and one-time location, and status uses the request token', async () => {
  const mock = fixture();
  mock.supabase.functions.invoke = async (name, options) => {
    mock.calls.push({ name, options });
    if (name === 'submit-assistance-request') return { data: { data: { status: 'new', joinedExisting: false, requestToken: options.body.requestToken, cancellableUntil: '2026-11-26T02:00:00Z', locationToken: options.body.locationToken } }, error: null };
    return { data: { data: { status: 'in_progress', cancelled: false } }, error: null };
  };
  globalThis.crypto ??= require('node:crypto').webcrypto;
  const { supabaseApi } = await loadSupabaseApi(mock);
  const result = await supabaseApi.recordQrScan('card-token', { latitude: 14.5, longitude: 121.0, accuracyMeters: 12, bystanderNotes: 'Sitting near the gate', locationDescription: 'Barangay hall gate' });
  const body = mock.calls[0].options.body;
  assert.equal(body.locationDescription, 'Barangay hall gate');
  assert.equal(body.publicNote, 'Sitting near the gate');
  assert.equal(body.accuracyMeters, 12);
  const status = await supabaseApi.getPublicAssistanceStatus(result.cancelToken);
  assert.equal(mock.calls[1].name, 'public-assistance-status');
  assert.equal(mock.calls[1].options.body.requestToken, result.cancelToken);
  assert.equal(status.status, 'in_progress');
});

test('resident edits never fall back to the full-row overwrite', async () => {
  const mock = fixture();
  mock.supabase.rpc = async (name, args) => {
    mock.calls.push({ rpc: name, args });
    if (name === 'update_resident_fields') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    return { data: [], error: null };
  };
  const { supabaseApi } = await loadSupabaseApi(mock);
  await assert.rejects(() => supabaseApi.updateResident('res-1', { fullName: 'Fictional Resident', homeAddress: 'Purok 1' }),
    (error) => error.code === 'BACKEND_UPDATE_PENDING');
  assert.deepEqual(mock.calls.map((call) => call.rpc), ['update_resident_fields']);
});

test('resident edits send only the edited fields', async () => {
  const mock = fixture();
  mock.supabase.storage = { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) };
  mock.supabase.rpc = async (name, args) => {
    mock.calls.push({ rpc: name, args });
    if (name === 'update_resident_fields') return { data: [{ resident_id: 'res-1' }], error: null };
    return { data: [{ resident_id: 'res-1', full_name: 'Fictional Resident' }], error: null };
  };
  const { supabaseApi } = await loadSupabaseApi(mock);
  await supabaseApi.updateResident('res-1', { fullName: ' Fictional Resident ', dateOfBirth: '1950-01-31' });
  const call = mock.calls.find((item) => item.rpc === 'update_resident_fields');
  assert.deepEqual(call.args, { p_resident_id: 'res-1', p_changes: { full_name: 'Fictional Resident', date_of_birth: '1950-01-31' } });
  assert.equal(mock.calls.some((item) => /update_resident_with_birth_date|^update_resident$/.test(item.rpc)), false);
});
