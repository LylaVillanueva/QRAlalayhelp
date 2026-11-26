// The four-colour motif from the logo's four helping hands: red, yellow,
// green and blue. Decorative only.
export default function BrandDots({ className = '' }) {
  return (
    <span className={`brand-dots ${className}`} aria-hidden="true">
      <span className="brand-dots__dot brand-dots__dot--red" />
      <span className="brand-dots__dot brand-dots__dot--yellow" />
      <span className="brand-dots__dot brand-dots__dot--green" />
      <span className="brand-dots__dot brand-dots__dot--blue" />
    </span>
  );
}
