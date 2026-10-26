const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Send one request to the backend and return only its `data` field.
// The backend's errors are converted into normal JavaScript Error objects so
// screens can display a useful message to the person using the app.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Request failed (${res.status})`);
    err.code = json?.error?.code;
    err.status = res.status;
    throw err;
  }
  return json?.data;
}

// These are the backend actions used by the public QR screen.
export const api = {
  getPublicQrView: (token) => request(`/qr/${token}/public-view`),
  recordScanEvent: (token, body) => request(`/qr/${token}/scan-event`, { method: 'POST', body }),
  cancelScan: (cancelToken) => request('/qr/cancel', { method: 'POST', body: { cancelToken } }),
  shareLocation: (shareToken, { latitude, longitude }) =>
    request('/qr/location', { method: 'POST', body: { shareToken, latitude, longitude } }),
  stopLocation: (shareToken) => request('/qr/location/stop', { method: 'POST', body: { shareToken } }),
};
