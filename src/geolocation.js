// Best-effort location grab. Bystanders may deny the permission or be on
// a device without GPS — the scan must still work, just without coords.
//
// Asks for real GPS (not Wi-Fi/cell estimates) and never reuses a cached
// fix. The first reading is often rough, so it keeps listening and returns
// as soon as one is within GOOD_ACCURACY_M, or the best one seen when time
// runs out — an emergency alert should not wait longer than that.
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

// Live tracking for "Share live location". Calls `onPosition` whenever the
// device reports a usable fix and `onError` if permission is denied. Returns
// a function that stops watching. Browsers pause this while the page is in
// the background or the screen is locked.
//
// A phone briefly losing GPS (indoors, under a roof) falls back to rough
// Wi-Fi/cell fixes hundreds of metres off. Those are skipped while a precise
// fix from the last 30 seconds exists, so the pin doesn't jump around.
export function watchPosition(onPosition, onError) {
  if (!navigator.geolocation) {
    onError({ code: 'UNSUPPORTED' });
    return () => {};
  }
  let lastGood = null;
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const now = Date.now();
      const muchWorse = lastGood && accuracy > Math.max(lastGood.accuracy * 2, 50) && now - lastGood.at < 30000;
      if (muchWorse) return;
      lastGood = { accuracy, at: now };
      onPosition({ latitude, longitude, accuracy });
    },
    (err) => onError(err),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}
