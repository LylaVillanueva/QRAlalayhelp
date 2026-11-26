import ScanPage from './pages/ScanPage.jsx';
import PageLayout from './components/PageLayout.jsx';

// QR tokens are 24 random bytes in base64url (32 characters). Anything that
// doesn't look like one is rejected here, without calling the server.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

// The site has one real destination: a QR card opens /scan/<token> directly.
// Every other address shows a short notice, with no way to type in a code.
export default function App() {
  const match = window.location.pathname.match(/^\/scan\/([^/]+)\/?$/);
  const token = match ? safeDecode(match[1]) : null;

  if (token && TOKEN_PATTERN.test(token)) return <ScanPage token={token} />;
  return <NoCard invalid={Boolean(match)} />;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function NoCard({ invalid }) {
  return (
    <PageLayout>
      <section className="status-block">
        <h1>{invalid ? 'This QR code isn’t valid' : 'Scan a QRAlalay card'}</h1>
        <p className="body-copy">
          {invalid
            ? 'The link is incomplete or damaged. Try scanning the card again, or ask the barangay for help.'
            : 'This page opens when you scan the QR card of a resident who may need help.'}
        </p>
      </section>
      <a className="button button-danger" href="tel:911">Call 911 now</a>
      <hr className="divider" />
      <p className="fine-print">If someone is in immediate danger, call emergency services first.</p>
    </PageLayout>
  );
}
