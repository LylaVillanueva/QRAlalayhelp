import { useI18n } from '../i18n.jsx';
import PageLayout from '../components/PageLayout.jsx';
import CallActions from '../components/CallActions.jsx';
import { EFFECTIVE_DATE, LEGAL_PAGES } from '../content/legal.js';

// About, Privacy Policy and Terms of Service.
export default function InfoPage({ page }) {
  const { t, language } = useI18n();
  const content = LEGAL_PAGES[page];
  return (
    <PageLayout>
      <a className="back-link" href="/">{t('backHome')}</a>
      <h1 className="page-title">{content.title}</h1>
      {language === 'fil' && t('legalEnglishOnly') && <p className="helper-text" lang="fil">{t('legalEnglishOnly')}</p>}
      {page !== 'about' && <p className="helper-text">Effective date: {EFFECTIVE_DATE}</p>}
      <div className="prose" lang="en">
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>
              {section.body}
              {section.email && <> <a href={`mailto:${section.email}`}>{section.email}</a></>}
              {section.website && <> <a href={section.website}>{section.website}</a></>}
            </p>
          </section>
        ))}
      </div>
      {page === 'about' && <CallActions showBarangay={false} />}
    </PageLayout>
  );
}
