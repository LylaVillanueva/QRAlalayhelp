import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { getCurrentPosition } from '../services/geolocation';
import { useI18n } from '../i18n.jsx';
import PageLayout from '../components/PageLayout.jsx';
import CallActions from '../components/CallActions.jsx';
import Notice from '../components/Notice.jsx';
import Icon from '../components/Icon.jsx';

const NOTE_LIMIT = 1000;      // submit-assistance-request: publicNote max length
const LANDMARK_LIMIT = 500;   // submit-assistance-request: locationDescription max length

// Turns an Edge Function failure into a page state. 404 means the card is not
// active (revoked, replaced or unknown); anything without an HTTP status is a
// connection problem the visitor can retry.
function classifyLoadError(error) {
  if (error?.status === 404 || error?.code === 'QR_NOT_ACTIVE') return 'invalid';
  if (error?.status === 400) return 'invalidLink';
  if (error?.status === 429) return 'busy';
  return 'network';
}

export default function ScanPage({ token }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState('loading'); // loading | ready | invalid | invalidLink | busy | network | sent | cancelled
  const [card, setCard] = useState(null);
  const [landmark, setLandmark] = useState('');
  const [note, setNote] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [submitStep, setSubmitStep] = useState(null); // null | locating | sending
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [location, setLocation] = useState(null); // { shared, accuracy } | { shared: false, denied }
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState(null);

  const load = useCallback(() => {
    let active = true;
    setPhase('loading');
    api.getPublicQrView(token)
      .then((data) => {
        if (!active) return;
        if (data && data.active === false) { setPhase('invalid'); return; }
        setCard(data || {});
        setPhase('ready');
      })
      .catch((error) => { if (active) setPhase(classifyLoadError(error)); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => load(), [load]);

  // Countdown for cancelling a mistaken request.
  useEffect(() => {
    if (phase !== 'sent' || !result?.cancellableUntil || !result?.cancelToken) { setSecondsLeft(0); return undefined; }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(result.cancellableUntil).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [phase, result]);

  const checkStatus = useCallback(async (requestToken) => {
    if (!requestToken) return;
    setChecking(true);
    setStatusError(null);
    try {
      const latest = await api.getRequestStatus(requestToken);
      setStatus({ ...latest, checkedAt: new Date() });
    } catch (error) {
      setStatusError(error.status ? error.message : t('networkBody'));
    } finally {
      setChecking(false);
    }
  }, [t]);

  async function submit(event) {
    event.preventDefault();
    if (submitStep) return;
    setSubmitError(null);
    let position = null;
    if (shareLocation) {
      setSubmitStep('locating');
      position = await getCurrentPosition();
    }
    setSubmitStep('sending');
    try {
      const sent = await api.recordScanEvent(token, {
        bystanderNotes: note.trim() || undefined,
        locationDescription: landmark.trim() || undefined,
        latitude: position?.latitude,
        longitude: position?.longitude,
        accuracyMeters: position ? Math.round(position.accuracy) : undefined,
      });
      setResult(sent);
      setLocation(position ? { shared: true, accuracy: Math.round(position.accuracy) } : { shared: false, denied: shareLocation });
      setPhase('sent');
      checkStatus(sent.cancelToken);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(error.status === 429 ? t('busyBody') : error.status ? error.message : t('networkBody'));
    } finally {
      setSubmitStep(null);
    }
  }

  async function cancel() {
    if (cancelling || !result?.cancelToken) return;
    setCancelling(true);
    setCancelMessage(null);
    try {
      const response = await api.cancelScan(result.cancelToken);
      if (response?.cancelled) setPhase('cancelled');
      else {
        setResult((current) => ({ ...current, cancellableUntil: null }));
        setCancelMessage(t('cannotCancel'));
      }
    } catch (error) {
      setCancelMessage(error.status ? error.message : t('networkBody'));
    } finally {
      setCancelling(false);
    }
  }

  if (phase === 'loading') {
    return (
      <PageLayout protectFlow>
        <section className="state-panel" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <h1>{t('loadingTitle')}</h1>
          <p>{t('loadingBody')}</p>
        </section>
        <CallActions showBarangay={false} />
      </PageLayout>
    );
  }

  if (['invalid', 'invalidLink', 'busy', 'network'].includes(phase)) {
    const copy = {
      invalid: [t('invalidTitle'), t('invalidBody'), 'danger'],
      invalidLink: [t('invalidLinkTitle'), t('invalidLinkBody'), 'danger'],
      busy: [t('busyTitle'), t('busyBody'), 'warning'],
      network: [t('networkTitle'), t('networkBody'), 'warning'],
    }[phase];
    return (
      <PageLayout protectFlow>
        <h1 className="page-title">{copy[0]}</h1>
        <Notice tone={copy[2]} role="alert">
          <p>{copy[1]}</p>
          <p>{t('invalidRecovery')}</p>
        </Notice>
        {(phase === 'network' || phase === 'busy') && (
          <button type="button" className="button button--primary" onClick={load}>
            <Icon name="refresh" /> {t('tryAgain')}
          </button>
        )}
        <CallActions showBarangay={false} />
      </PageLayout>
    );
  }

  if (phase === 'cancelled') {
    return (
      <PageLayout protectFlow>
        <h1 className="page-title">{t('cancelledTitle')}</h1>
        <Notice tone="info" live><p>{t('cancelledBody')}</p></Notice>
        <CallActions contacts={card?.contacts || []} />
      </PageLayout>
    );
  }

  const barangay = card?.barangayName ? formatBarangay(card.barangayName) : null;
  const cardSummary = (
    <section className="card resident-card" aria-label={t('validCard')}>
      <p className="badge badge--success"><Icon name="check" size={18} /> {t('validCard')}</p>
      {barangay && <p className="resident-card__barangay"><span className="field-name">{t('barangay')}:</span> {barangay}</p>}
      {card?.displayName && <p className="resident-card__detail"><span className="field-name">{t('approvedName')}:</span> {card.displayName}</p>}
      {card?.assistanceInstructions && <p className="resident-card__detail"><span className="field-name">{t('approvedInstructions')}:</span> {card.assistanceInstructions}</p>}
    </section>
  );

  if (phase === 'sent') {
    const stage = status?.cancelled ? 'cancelled' : status?.status;
    return (
      <PageLayout protectFlow>
        <h1 className="page-title">{t('sentTitle')}</h1>
        <Notice tone="success" live>
          <p>{result?.joined ? t('joinedBody') : t('sentBody')}</p>
        </Notice>

        <section className="card" aria-labelledby="location-result">
          <h2 id="location-result" className="card-title"><Icon name="location" /> {location?.shared ? t('locationShared') : t('locationNotShared')}</h2>
          <p className="helper-text">
            {location?.shared
              ? t('locationAccuracy', { m: location.accuracy })
              : location?.denied ? t('locationDenied') : t('locationOptedOut')}
          </p>
        </section>

        <section className="card" aria-labelledby="status-heading" aria-live="polite">
          <h2 id="status-heading" className="card-title"><Icon name="clock" /> {t('statusTitle')}</h2>
          {stage ? <>
            <p className={`stage stage--${stage}`}>{t(`stage_${stage}`)}</p>
            <p className="helper-text">{t(`stageHint_${stage}`)}</p>
            <p className="helper-text">{t('statusCheckedAt', { time: status.checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })}</p>
          </> : <p className="helper-text">{t('statusUnknown')}</p>}
          {statusError && <p className="error-text" role="alert">{statusError}</p>}
          <button type="button" className="button button--secondary" onClick={() => checkStatus(result?.cancelToken)} disabled={checking}>
            <Icon name="refresh" /> {checking ? t('checking') : t('checkStatus')}
          </button>
        </section>

        {secondsLeft > 0 ? (
          <section className="card">
            <button type="button" className="button button--neutral" onClick={cancel} disabled={cancelling}>
              <Icon name="close" /> {cancelling ? t('cancelling') : t('cancelRequest', { s: secondsLeft })}
            </button>
            <p className="helper-text">{t('cancelHint')}</p>
          </section>
        ) : stage !== 'closed' && (!result?.cancellableUntil || Date.parse(result.cancellableUntil) <= Date.now()) && <Notice tone="warning" title={t('cancelExpired')} />}
        {cancelMessage && <Notice tone="warning" title={cancelMessage} role="alert" />}

        <CallActions contacts={card?.contacts || []} />
      </PageLayout>
    );
  }

  const busy = Boolean(submitStep);
  return (
    <PageLayout protectFlow>
      <h1 className="page-title">{t('helpTitle')}</h1>
      <p className="lead">{t('helpIntro')}</p>
      {cardSummary}

      <form className="card request-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="landmark" className="field-label">{t('landmarkLabel')}</label>
          <input id="landmark" className="input" value={landmark} maxLength={LANDMARK_LIMIT} autoComplete="off"
            aria-describedby="landmark-hint" onChange={(event) => setLandmark(event.target.value)} />
          <p id="landmark-hint" className="helper-text">{t('landmarkHint')}</p>
        </div>

        <div className="field">
          <label htmlFor="note" className="field-label">{t('noteLabel')}</label>
          <textarea id="note" className="input input--textarea" rows={4} value={note} maxLength={NOTE_LIMIT}
            aria-describedby="note-hint" onChange={(event) => setNote(event.target.value)} />
          <p id="note-hint" className="helper-text">{t('noteHint')} <span className="char-count">{note.length}/{NOTE_LIMIT}</span></p>
        </div>

        <div className="checkbox-field">
          <input id="share-location" type="checkbox" checked={shareLocation} onChange={(event) => setShareLocation(event.target.checked)} aria-describedby="share-location-hint" />
          <label htmlFor="share-location">
            <span className="checkbox-field__label"><Icon name="location" size={20} /> {t('shareLocationLabel')}</span>
            <span id="share-location-hint" className="helper-text">{t('shareLocationHint')}</span>
          </label>
        </div>

        {submitError && (
          <Notice tone="danger" title={t('submitFailed')} role="alert">
            <p>{submitError}</p>
            <p>{t('submitRetry')}</p>
          </Notice>
        )}

        <button type="submit" className="button button--primary button--large" disabled={busy} aria-busy={busy}>
          <Icon name="heart" /> {submitStep === 'locating' ? t('findingLocation') : submitStep === 'sending' ? t('sending') : t('requestAssistance')}
        </button>
        <p className="helper-text">{t('privacyNoteScan')}</p>
      </form>

      <CallActions contacts={card?.contacts || []} />
    </PageLayout>
  );
}

// Names may be stored as "Uno Tondo" or already as "Barangay Uno Tondo".
function formatBarangay(name) {
  return /^(brgy\.?|barangay)\b/i.test(name) ? name : `Barangay ${name}`;
}
