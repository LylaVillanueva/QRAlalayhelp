import { useI18n } from './i18n.jsx';
import ScanPage from './pages/ScanPage.jsx';
import HomePage from './pages/HomePage.jsx';
import InfoPage from './pages/InfoPage.jsx';
import PageLayout from './components/PageLayout.jsx';
import CallActions from './components/CallActions.jsx';
import Notice from './components/Notice.jsx';

// Same format the server accepts for QR tokens (base64url, 32-64 characters).
// Anything else is rejected here without calling the server.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const INFO_PAGES = { '/about': 'about', '/privacy': 'privacy', '/terms': 'terms' };

// Printed QR cards open /scan/<token>; that route must never change.
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const scan = path.match(/^\/scan\/([^/]+)$/);

  if (scan) {
    const token = safeDecode(scan[1]);
    return token && TOKEN_PATTERN.test(token) ? <ScanPage token={token} /> : <BrokenLink />;
  }
  if (path.startsWith('/scan')) return <BrokenLink />;
  if (INFO_PAGES[path]) return <InfoPage page={INFO_PAGES[path]} />;
  return <HomePage />;
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return null; }
}

function BrokenLink() {
  const { t } = useI18n();
  return (
    <PageLayout protectFlow>
      <h1 className="page-title">{t('invalidLinkTitle')}</h1>
      <Notice tone="danger" role="alert">
        <p>{t('invalidLinkBody')}</p>
        <p>{t('invalidRecovery')}</p>
      </Notice>
      <CallActions showBarangay={false} />
    </PageLayout>
  );
}
