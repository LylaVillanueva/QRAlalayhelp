import { useI18n } from '../i18n.jsx';
import Icon from './Icon.jsx';

function telHref(phone) {
  return `tel:${String(phone).replace(/[^+\d]/g, '')}`;
}

// Call Barangay (only a barangay-confirmed number, never a guess) and Call 911.
// Tapping opens the phone's dialer, which asks before placing the call.
export default function CallActions({ contacts, showBarangay = true, heading = true }) {
  const { t } = useI18n();
  // The public view orders confirmed contacts primary-first; show that one.
  const contact = (contacts || []).find((item) => item?.phone);
  return (
    <section className="call-actions" aria-labelledby={heading ? 'call-actions-heading' : undefined}>
      {heading && <h2 id="call-actions-heading" className="section-title">{t('needHelpNow')}</h2>}
      {showBarangay && (contact ? (
        <a className="button button--secondary call-button" href={telHref(contact.phone)}>
          <Icon name="phone" />
          <span className="call-button__text">
            <span className="call-button__label">{t('callBarangay')}</span>
            <span className="call-button__detail">{contact.label} · {contact.phone}{contact.availability ? ` · ${contact.availability}` : ''}</span>
          </span>
        </a>
      ) : contacts !== undefined && <p className="helper-text">{t('noBarangayContact')}</p>)}
      <a className="button button--danger call-button" href="tel:911">
        <Icon name="phone" />
        <span className="call-button__text">
          <span className="call-button__label">{t('call911')}</span>
          <span className="call-button__detail">{t('call911Note')}</span>
        </span>
      </a>
    </section>
  );
}
