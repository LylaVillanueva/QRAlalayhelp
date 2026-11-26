import { useI18n } from '../i18n.jsx';
import BrandDots from './BrandDots.jsx';

const LOGO = '/branding/qralalay-logo-192.webp';

// Shared frame for every page: curved Bayanihan Blue header, a single reading
// column, and a footer with the legal pages.
//
// `protectFlow` is set on the QR page. There the logo is not a link and footer
// links open in a new tab, so a hurried tap can never discard a request.
export default function PageLayout({ children, hero = null, protectFlow = false }) {
  const { t, toggleLanguage } = useI18n();
  const linkProps = protectFlow ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  const brand = (
    <>
      <img className="brand-logo" src={LOGO} alt="" width="56" height="56" />
      <span className="brand-name">QRAlalay</span>
    </>
  );

  return (
    <div className="page">
      <a className="skip-link" href="#main">{t('skipToContent')}</a>
      <header className={`site-header${hero ? ' site-header--hero' : ''}`}>
        <div className="site-header__bar">
          {protectFlow
            ? <div className="brand" aria-label="QRAlalay">{brand}</div>
            : <a className="brand" href="/" aria-label="QRAlalay home">{brand}</a>}
          <button type="button" className="language-toggle" onClick={toggleLanguage} lang={t('switchLanguage').startsWith('Wika') ? 'fil' : 'en'}>
            {t('switchLanguage')}
          </button>
        </div>
        {hero && <div className="site-header__hero">{hero}</div>}
        <svg className="site-header__curve" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0 46C240 14 480 60 720 52S1200 70 1440 24V80H0Z" />
        </svg>
      </header>

      <main id="main" className="page-content" tabIndex={-1}>{children}</main>

      <footer className="site-footer">
        <BrandDots />
        <p className="site-footer__message">{t('brandMessage')}</p>
        <nav aria-label="QRAlalay information">
          <ul className="site-footer__links">
            {!protectFlow && <li><a href="/">{t('footerHome')}</a></li>}
            <li><a href="/about" {...linkProps}>{t('footerAbout')}</a></li>
            <li><a href="/privacy" {...linkProps}>{t('footerPrivacy')}</a></li>
            <li><a href="/terms" {...linkProps}>{t('footerTerms')}</a></li>
          </ul>
        </nav>
        <p className="site-footer__note">{t('footerNote')}</p>
      </footer>
    </div>
  );
}
