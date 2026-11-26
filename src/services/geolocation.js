// Best-effort location grab. Bystanders may deny the permission or be on
// a device without GPS — the scan must still work, just without coords.
//
// Asks for real GPS (not Wi-Fi/cell estimates) and never reuses a cached
// fix. The first reading is often rough, so it keeps listening and returns
// as soon as one is within GOOD_ACCURACY_M, or the best one seen when time
// runs out. Used once per request; QRAlalay never tracks location continuously.
// Resolves to null when permission is denied or no fix is available.
const GOOD_ACCURACY_M = 25;

export function getCurrentPosition({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    let best = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      resolve(best && { latitude: best.latitude, longitude: best.longitude, accuracy: best.accuracy });
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
        if (!best || reading.accuracy < best.accuracy) best = reading;
        if (best.accuracy <= GOOD_ACCURACY_M) finish();
      },
      () => finish(),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
    const timer = setTimeout(finish, timeoutMs);
  });
}
