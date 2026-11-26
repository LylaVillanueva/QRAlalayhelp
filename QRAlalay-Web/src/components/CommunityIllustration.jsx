// A neighbourhood scene: an older resident with a cane, supported by a barangay
// volunteer, beside a house and a tree. Lightweight inline SVG, decorative only.
export default function CommunityIllustration({ className = '' }) {
  return (
    <svg className={`community-illustration ${className}`} viewBox="0 0 360 200" aria-hidden="true" focusable="false">
      <circle className="ill-sun" cx="58" cy="46" r="18" />
      <path className="ill-ground" d="M0 168Q90 138 180 158T360 148V200H0Z" />

      <g className="ill-house">
        <rect className="ill-wall" x="238" y="110" width="56" height="50" rx="3" />
        <path className="ill-roof" d="M228 114 266 82l38 32z" />
        <rect className="ill-door" x="259" y="132" width="14" height="28" rx="2" />
        <rect className="ill-window" x="244" y="121" width="10" height="10" rx="1.5" />
        <rect className="ill-window" x="279" y="121" width="10" height="10" rx="1.5" />
      </g>
      <rect className="ill-trunk" x="321" y="128" width="6" height="30" rx="2" />
      <circle className="ill-leaves" cx="324" cy="118" r="20" />

      <path className="ill-heart" d="M146 66s-11-6.7-11-13.6c0-3.6 2.8-6.1 5.8-6.1 2.3 0 4.1 1.3 5.2 3.1 1.1-1.8 2.9-3.1 5.2-3.1 3 0 5.8 2.5 5.8 6.1 0 6.9-11 13.6-11 13.6z" />

      {/* Older resident */}
      <rect className="ill-legs" x="110" y="144" width="8" height="24" rx="3" />
      <rect className="ill-legs" x="122" y="144" width="8" height="24" rx="3" />
      <rect className="ill-shirt-yellow" x="104" y="106" width="32" height="42" rx="13" />
      <circle className="ill-skin-a" cx="120" cy="92" r="13" />
      <path className="ill-hair-grey" d="M107 91a13 13 0 0 1 26 0c-5-4-21-4-26 0z" />
      <path className="ill-cane" d="M141 124v44" />
      <circle className="ill-skin-a" cx="139" cy="124" r="4.5" />

      {/* Barangay volunteer */}
      <rect className="ill-legs" x="161" y="140" width="9" height="28" rx="3" />
      <rect className="ill-legs" x="175" y="140" width="9" height="28" rx="3" />
      <rect className="ill-shirt-blue" x="155" y="94" width="36" height="52" rx="13" />
      <path className="ill-arm" d="M160 106q-14-4-28 6" />
      <circle className="ill-skin-b" cx="173" cy="79" r="13" />
      <path className="ill-hair-dark" d="M160 78a13 13 0 0 1 26-1c-6-5-17-6-26 1z" />
    </svg>
  );
}
