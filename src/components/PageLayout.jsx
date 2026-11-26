import logo from '../assets/logo.png';

// Shared frame: logo, divider, content. The logo isn't a link, so a tap in a
// hurry can't navigate away from a resident's emergency page.
export default function PageLayout({ children }) {
  return (
    <div className="page">
      <header className="site-header">
        <img className="brand-logo" src={logo} alt="QRAlalay" />
      </header>
      <hr className="divider" />
      <main className="page-content">{children}</main>
    </div>
  );
}
