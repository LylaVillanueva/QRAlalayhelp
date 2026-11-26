import Icon from './Icon.jsx';

const ICONS = { info: 'info', success: 'check', warning: 'clock', danger: 'alert' };

// A status message. The tone sets colour and icon, but the title always says
// the meaning in words. `live` announces changes to screen readers.
export default function Notice({ tone = 'info', title, children, live = false, role }) {
  return (
    <div className={`notice notice--${tone}`} role={role || (live ? 'status' : undefined)} aria-live={live ? 'polite' : undefined}>
      <Icon name={ICONS[tone]} className="notice__icon" />
      <div className="notice__body">
        {title && <p className="notice__title">{title}</p>}
        {children && <div className="notice__text">{children}</div>}
      </div>
    </div>
  );
}
