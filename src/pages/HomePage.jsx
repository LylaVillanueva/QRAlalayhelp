import { useI18n } from '../i18n.jsx';
import PageLayout from '../components/PageLayout.jsx';
import CallActions from '../components/CallActions.jsx';
import CommunityIllustration from '../components/CommunityIllustration.jsx';
import BrandDots from '../components/BrandDots.jsx';
import Notice from '../components/Notice.jsx';
import Icon from '../components/Icon.jsx';

// The public landing page: what QRAlalay is and how the resident card works.
// No accounts, statistics or claims beyond what the system does.
export default function HomePage() {
  const { t } = useI18n();
  const steps = [
    { icon: 'card', title: t('howStep1Title'), body: t('howStep1') },
    { icon: 'heart', title: t('howStep2Title'), body: t('howStep2') },
    { icon: 'people', title: t('howStep3Title'), body: t('howStep3') },
  ];

  const hero = (
    <div className="hero">
      <div className="hero__text">
        <h1 className="hero__message">{t('brandMessage')}</h1>
        <p className="hero__tagline">{t('tagline')}</p>
      </div>
      <CommunityIllustration className="hero__art" />
    </div>
  );

  return (
    <PageLayout hero={hero}>
      <p className="lead">{t('homeIntro')}</p>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="section-title">{t('howTitle')}</h2>
        <BrandDots className="section-dots" />
        <ol className="steps">
          {steps.map((step, index) => (
            <li className="step card" key={step.title}>
              <span className={`step__number step__number--${index + 1}`} aria-hidden="true">{index + 1}</span>
              <div>
                <h3 className="step__title"><Icon name={step.icon} size={22} /> {step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card card--info" aria-labelledby="found-heading">
        <h2 id="found-heading" className="card-title">{t('noCardTitle')}</h2>
        <p>{t('noCardBody')}</p>
      </section>

      <Notice tone="info" title={t('communityTitle')}><p>{t('communityBody')}</p></Notice>

      <CallActions showBarangay={false} />
    </PageLayout>
  );
}
