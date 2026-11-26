const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;

function configuration() {
  if (!FUNCTIONS_URL || !SUPABASE_ANON_KEY) {
    throw new Error('The public QR service is not configured.');
  }
  return { functionsUrl: FUNCTIONS_URL, anonKey: SUPABASE_ANON_KEY };
}

async function invoke(name, body) {
  const { functionsUrl, anonKey } = configuration();
  const response = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(json?.error?.message || `Request failed (${response.status})`);
    error.code = json?.error?.code;
    error.status = response.status;
    throw error;
  }
  return json?.data;
}

function randomCapability() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function capabilitiesFor(token) {
  const storageKey = `qralalay.public-request.${token}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed?.idempotencyKey && parsed?.requestToken && parsed?.locationToken) return { ...parsed, storageKey };
    }
    const created = { idempotencyKey: crypto.randomUUID(), requestToken: randomCapability(), locationToken: randomCapability() };
    sessionStorage.setItem(storageKey, JSON.stringify(created));
    return { ...created, storageKey };
  } catch {
    // Browser privacy settings may block storage. Capabilities still remain
    // in memory for the current page; a retry after reload uses a new key.
    return { idempotencyKey: crypto.randomUUID(), requestToken: randomCapability(), locationToken: randomCapability(), storageKey: null };
  }
}

function clearCapabilities(token) {
  try { sessionStorage.removeItem(`qralalay.public-request.${token}`); } catch { /* Storage is optional. */ }
}

function clearCapabilitiesForRequest(requestToken) {
  try {
    const prefix = 'qralalay.public-request.';
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (parsed?.requestToken === requestToken) sessionStorage.removeItem(key);
    }
  } catch { /* Storage is optional. */ }
}

export const api = {
  getPublicQrView: (token) => invoke('public-qr-view', { token }),

  async recordScanEvent(token, body = {}) {
    const capabilities = capabilitiesFor(token);
    const data = await invoke('submit-assistance-request', {
      token,
      idempotencyKey: capabilities.idempotencyKey,
      requestToken: capabilities.requestToken,
      locationToken: capabilities.locationToken,
      publicNote: body.bystanderNotes,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyMeters: body.accuracyMeters,
      locationDescription: body.locationDescription,
    });
    return {
      status: data.status,
      joined: data.joinedExisting,
      cancelToken: data.requestToken,
      cancellableUntil: data.cancellableUntil,
      locationShareToken: data.locationToken,
    };
  },

  async cancelScan(cancelToken) {
    const result = await invoke('cancel-assistance-request', { requestToken: cancelToken });
    if (result?.cancelled) clearCapabilitiesForRequest(cancelToken);
    return result;
  },

  // Status of the bystander's own request, authorized by the request token
  // created in this browser. Returns { status, createdAt, cancellableUntil, cancelled }.
  getRequestStatus: (requestToken) => invoke('public-assistance-status', { requestToken }),

  clearPublicRequest(token) { clearCapabilities(token); },
};
