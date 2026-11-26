import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { getCurrentPosition, watchPosition } from '../services/geolocation';

// How often the latest position is sent while sharing live location.
const SHARE_INTERVAL_MS = 10000;
// Continuous live sharing is deferred; the one-time location is still sent
// with the assistance request. Set to true to show the controls again.
const LIVE_LOCATION_SHARING_ENABLED = false;
import PageLayout from '../components/PageLayout.jsx';

export default function ScanPage({ token }) {
  // `phase` tells the page which part of the scan flow it should display.
  const [phase, setPhase] = useState('loading');
  const [resident, setResident] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState(null);
  const [cancelSecondsLeft, setCancelSecondsLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const liveLocation = useLiveLocationShare(result?.locationShareToken);

  useEffect(() => {
    if (phase !== 'raised' || !result?.cancelToken || !result?.cancellableUntil) return undefined;

    const updateCountdown = () => {
      const seconds = (new Date(result.cancellableUntil).getTime() - Date.now()) / 1000;
      setCancelSecondsLeft(Math.max(0, Math.round(seconds)));
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [phase, result]);

  useEffect(() => {
    // Load the public information attached to this QR token.
    let pageWasClosed = false;

    api
      .getPublicQrView(token)
      .then((data) => {
        if (pageWasClosed) return;
        setResident(data);
        setPhase('ready');
      })
      .catch((requestError) => {
        if (pageWasClosed) return;
        setError(requestError.message);
        setPhase('error');
      });

    return () => {
      pageWasClosed = true;
    };
  }, [token]);

  async function raiseAlert() {
    setPhase('submitting');
    setError(null);

    try {
      // Location is optional. The alert can still be sent if the bystander
      // denies location permission or the device cannot find its location.
      const position = await getCurrentPosition();
      const alert = await api.recordScanEvent(token, {
        latitude: position?.latitude,
        longitude: position?.longitude,
        bystanderNotes: notes.trim() || undefined,
      });

      setResult(alert);
      setPhase('raised');
    } catch (requestError) {
      setError(requestError.message);
      setPhase('ready');
    }
  }

  async function cancelAlert() {
    if (cancelling || !result?.cancelToken) return;

    setCancelling(true);
    try {
      const response = await api.cancelScan(result.cancelToken);
      if (response?.cancelled) {
        liveLocation.stop();
        setPhase('cancelled');
      } else {
        setError('This alert can no longer be cancelled. Contact the barangay if it was a mistake.');
        setResult((current) => ({ ...current, cancelToken: null }));
        setCancelSecondsLeft(0);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCancelling(false);
    }
  }

  if (phase === 'loading') {
    return (
      <PageLayout>
        <section className="status-block" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true" />
          <h1>Loading details</h1>
          <p className="body-copy">Please wait while we retrieve the information linked to this QR code.</p>
        </section>
      </PageLayout>
    );
  }

  if (phase === 'error' && !resident) {
    return (
      <PageLayout>
        <section className="status-block" role="alert">
          <h1>This QR code isn’t available</h1>
          <p className="body-copy error-text">{error}</p>
          <p className="body-copy">Check that this is the latest QR code, or ask the barangay for help.</p>
        </section>
        <hr className="divider" />
        <a className="button button-danger" href="tel:911">Call 911 now</a>
      </PageLayout>
    );
  }

  if (phase === 'cancelled') {
    return (
      <PageLayout>
        <section className="status-block" aria-live="polite">
          <h1>Alert cancelled</h1>
          <p className="body-copy">
            The alert was cancelled. Notifications may already have been sent. If this is a real emergency, call for help or scan the code again.
          </p>
        </section>
      </PageLayout>
    );
  }

  if (phase === 'raised') {
    return (
      <PageLayout>
        <section className="status-block" aria-live="polite">
          <h1>Assistance request registered</h1>
          <p className="body-copy">
            The barangay can review this request. Any location you chose to share was included. This confirmation does not mean that assistance has arrived.
          </p>
        </section>

        {LIVE_LOCATION_SHARING_ENABLED && result.locationShareToken && (
          liveLocation.status === 'sharing' || liveLocation.status === 'starting' ? (
            <>
              <button className="button button-neutral" onClick={liveLocation.stop}>Stop sharing location</button>
              <p className="status-note live-note" role="status">
                <span className="live-dot" aria-hidden="true" />
                {liveLocation.status === 'starting'
                  ? 'Finding your location…'
                  : `Sharing your live location · updated ${formatAgo(liveLocation.lastSentAt)}`}
              </p>
              <p className="helper-copy">Keep this page open to keep sharing.</p>
            </>
          ) : (
            <>
              <button className="button button-primary" onClick={liveLocation.start} disabled={liveLocation.status === 'ended'}>
                Share live location
              </button>
              {liveLocation.status === 'stopped' && <p className="status-note" role="status">You stopped sharing your location.</p>}
              {liveLocation.status === 'ended' && <p className="status-note" role="status">This alert is closed, so location sharing has ended.</p>}
              {liveLocation.status === 'denied' && (
                <p className="status-note error-text" role="status">We couldn’t get your location. Check that location access is allowed.</p>
              )}
              {liveLocation.error && <p className="status-note error-text" role="alert">{liveLocation.error}</p>}
            </>
          )
        )}

        <a className="button button-danger" href="tel:911">Call 911 now</a>

        {cancelSecondsLeft > 0 && (
          <>
            <button className="button button-neutral" onClick={cancelAlert} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : `Cancel alert (${cancelSecondsLeft}s)`}
            </button>
            <p className="helper-copy">Sent by mistake? You can cancel while the timer runs.</p>
          </>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}

        <hr className="divider" />
        <p className="fine-print">Your note will be logged in the incident record. No account required. Information and location are sent.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="resident-block">
        <h1 className="resident-name">QRAlalay</h1>
        {resident.barangayName && <p className="resident-meta">{formatBarangay(resident.barangayName)}</p>}
        <p className="body-copy">This card can help someone request community assistance and reconnect with an authorized guardian.</p>
      </section>

      {(resident.contacts || []).length > 0 && <>
        <hr className="divider" />
        <section className="response-section" aria-labelledby="barangay-contact-heading">
          <h2 id="barangay-contact-heading">Verified barangay contacts</h2>
          <p className="body-copy">Call a confirmed local contact for immediate assistance.</p>
          {resident.contacts.map((contact, index) => <a
            className="button button-neutral"
            href={`tel:${contact.phone}`}
            key={`${contact.label}-${contact.phone}-${index}`}
            aria-label={`Call ${contact.label}, ${contact.phone}`}
          >
            Call {contact.label}: {contact.phone}{contact.availability ? ` · ${contact.availability}` : ''}
          </a>)}
          <a className="button button-danger" href="tel:911">Call 911</a>
        </section>
      </>}

      <hr className="divider" />

      <section className="response-section" aria-labelledby="response-heading">
        <h1 id="response-heading">What is happening?</h1>
        <label className="field-label" htmlFor="notes">Add notes (optional)</label>
        <textarea
          id="notes"
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Found near the marker, seems confused and sitting on the ground…"
        />
        <p className="helper-copy">
          Your note will be shared with guardian and responders.
          <br />
          You can send an alert without adding a note.
        </p>

        {error && <p className="error-text" role="alert">{error}</p>}

        <button className="button button-danger" onClick={raiseAlert} disabled={phase === 'submitting'}>
          {phase === 'submitting' ? 'Sending alert…' : 'Send an Alert!'}
        </button>

        <a className="button button-neutral" href="tel:911">
          Skip and call 911 instead
        </a>
      </section>

      <hr className="divider" />
      <p className="fine-print">Your note will be logged in the incident record. No account required. Information and location are sent.</p>
    </PageLayout>
  );
}

// Sends the bystander's position every SHARE_INTERVAL_MS until they stop,
// the page closes, or the backend says the alert is no longer open.
function useLiveLocationShare(shareToken) {
  const [status, setStatus] = useState('idle'); // idle | starting | sharing | stopped | ended | denied
  const [lastSentAt, setLastSentAt] = useState(null);
  const [error, setError] = useState(null);
  const [, setClock] = useState(0);
  const latest = useRef(null);
  const stopWatching = useRef(null);
  const timer = useRef(null);

  function teardown() {
    stopWatching.current?.();
    stopWatching.current = null;
    clearInterval(timer.current);
    timer.current = null;
  }

  async function send() {
    if (!latest.current) return;
    try {
      const response = await api.shareLocation(shareToken, latest.current);
      if (response?.sharing === false) {
        teardown();
        setStatus('ended');
        return;
      }
      setLastSentAt(Date.now());
      setStatus('sharing');
      setError(null);
    } catch (requestError) {
      // A dropped request is retried on the next tick; only surface it.
      setError(requestError.message);
    }
  }

  function start() {
    if (!shareToken || stopWatching.current) return;
    setStatus('starting');
    setError(null);
    stopWatching.current = watchPosition(
      (position) => {
        const isFirstFix = !latest.current;
        latest.current = position;
        if (isFirstFix) send();
      },
      () => {
        teardown();
        setStatus('denied');
      }
    );
    timer.current = setInterval(send, SHARE_INTERVAL_MS);
  }

  function stop() {
    if (!stopWatching.current) return;
    teardown();
    latest.current = null;
    setStatus('stopped');
    api.stopLocation(shareToken).catch(() => {});
  }

  // Re-render every few seconds so "updated Xs ago" stays current.
  useEffect(() => {
    if (status !== 'sharing') return undefined;
    const tick = setInterval(() => setClock((n) => n + 1), 5000);
    return () => clearInterval(tick);
  }, [status]);

  useEffect(() => teardown, []);

  return { status, lastSentAt, error, start, stop };
}

function formatAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

// Names may be stored as "Uno Tondo" or already as "Barangay Uno Tondo".
function formatBarangay(name) {
  return /^(brgy|barangay)\b/i.test(name) ? name : `Brgy ${name}`;
}
