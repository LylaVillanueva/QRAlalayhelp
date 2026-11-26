// Shared visual language for every role: light surfaces, blue brand accents, red only for urgency.

// Digital Bayanihan palette, the same tokens as the public website
// (QRAlalay-Web/src/styles/tokens.css) and the authentication emails.
// Every screen takes its colors from `colors` below; add new colors here
// rather than as literals in a screen.
export const palette = {
  BAYANIHAN_BLUE: '#087DB8',
  DEEP_NAVY: '#103B66',
  MALASAKIT_RED: '#F45C59',
  PAG_ASA_YELLOW: '#FFBE28',
  KALIGTASAN_GREEN: '#79C957',
  WARM_WHITE: '#FAF6EF',
  PURE_WHITE: '#FFFFFF',
  ACTION: '#056BA3',
  ACTION_PRESSED: '#045580',
  TEXT_SECONDARY: '#53616A',
  BORDER: '#DCE5EA',
  // Kept for existing references.
  PRIMARY: '#056BA3',
  ALERT: '#F45C59',
  WARNING: '#FFBE28',
  SUCCESS: '#79C957',
  BACKGROUND: '#FAF6EF',
  SURFACE: '#FFFFFF',
  TEXT_PRIMARY: '#103B66',
};

// Roles: blue = brand, navigation and primary actions; red = urgent
// assistance, escalation and destructive actions only; yellow = pending and
// warnings; green = verified, safe and successful. The brand red, yellow and
// green are accents (icons, borders, dots); text uses the *Ink shades, which
// meet 4.5:1 on white and on their soft backgrounds.
export const colors = {
  primary: palette.ACTION,         // 5.6:1 on white
  primaryDark: palette.ACTION_PRESSED,
  primarySoft: '#E7F3FA',          // information background
  primaryBorder: '#B8DAEC',
  primaryBright: palette.BAYANIHAN_BLUE, // brand surfaces (headers), white text only at large sizes
  brand: palette.BAYANIHAN_BLUE,
  navy: palette.DEEP_NAVY,
  secondary: palette.ACTION,       // kept for existing references
  onPrimary: palette.PURE_WHITE,

  alert: palette.MALASAKIT_RED,    // icons, borders, accents
  alertInk: '#A83232',             // text and filled destructive buttons: 6.6:1 on white
  alertSoft: '#FCE4E2',
  alertBorder: '#F6BDBA',

  warning: palette.PAG_ASA_YELLOW, // fills with dark text only
  warningInk: '#826000',           // 5.4:1 on warningSoft
  warningSoft: '#FFF5D9',

  successBase: palette.KALIGTASAN_GREEN, // icons, borders, accents
  successInk: '#286C35',           // 6.3:1 on white
  successSoft: '#E8F5E1',

  background: palette.WARM_WHITE,  // the page canvas
  surface: palette.PURE_WHITE,     // cards and sheets sitting on the warm canvas
  surfaceSunken: '#F6F8F9',        // input fill

  ink: palette.DEEP_NAVY,
  text: palette.DEEP_NAVY,
  textPrimary: palette.DEEP_NAVY,
  textSecondary: palette.TEXT_SECONDARY, // 6.1:1 on white
  textMuted: '#7A8790',            // decorative icons, chevrons, disabled
  textFaint: palette.TEXT_SECONDARY,
  textPlaceholder: palette.TEXT_SECONDARY,

  border: palette.BORDER,
  borderStrong: '#B9C7CF',         // input outlines
  borderSoft: '#EAEFF2',
  overlay: 'rgba(16,59,102,0.45)',
  shadow: palette.DEEP_NAVY,

  // Status groups (text + background), used by status pills and badges.
  danger: { ink: '#A83232', bg: '#FCE4E2' },
  pending: { ink: '#826000', bg: '#FFF5D9' },
  success: { ink: '#286C35', bg: '#E8F5E1', soft: '#E8F5E1' },
  info: { ink: palette.ACTION, bg: '#E7F3FA' },

  dangerSurface: '#FCE4E2',        // light red fill for destructive buttons
};

// The four-colour motif from the logo, in logo order.
export const brandDots = [palette.MALASAKIT_RED, palette.PAG_ASA_YELLOW, palette.KALIGTASAN_GREEN, palette.BAYANIHAN_BLUE];

// Depth comes from 1px hairline borders, not drop shadows.
// Depth comes mainly from 1px hairline borders; cards add a very soft lift
// so they separate from the warm canvas, as in the design concept.
export const shadow = {
  card: { shadowColor: palette.DEEP_NAVY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  soft: { shadowColor: palette.DEEP_NAVY, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
};

// Left accent stripe for assistance cards, always paired with a text status
// label: red = new or escalated (needs action), yellow = in progress,
// green = closed. Closed cards are slightly muted.
export function statusAccent(status) {
  if (status === 'closed') return { borderLeftWidth: 5, borderLeftColor: palette.KALIGTASAN_GREEN, opacity: 0.88 };
  if (status === 'pending') return { borderLeftWidth: 5, borderLeftColor: palette.PAG_ASA_YELLOW };
  return { borderLeftWidth: 5, borderLeftColor: palette.MALASAKIT_RED };
}

// Logical pixels: readable at the default size, with optional larger text in Settings.
export const typography = { title: 30, section: 22, body: 18, detail: 16, caption: 14 };
// Tight tracking for large headings, as on the website.
export const tracking = { title: -0.6, section: -0.3 };
export const spacing = { screen: 24, section: 24, field: 24, card: 16, control: 56 };

export const radius = { sm: 10, md: 12, lg: 16, xl: 24, pill: 100 };

// Form controls follow the enrollment reference.
export const field = {
  labelSize: typography.body,
  labelColor: colors.textSecondary,
  inputBg: colors.surfaceSunken,
  inputBorder: colors.borderStrong,
};

export const font = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

// Maps a backend-ish status string to the semantic color group above —
// the same status→color logic was duplicated with the same hex values in
// ~8 places; this is the one place it should live.
export function statusTone(status) {
  if (status === 'closed' || status === 'Safe') return colors.success;
  if (status === 'escalated' || status === 'open' || status === 'Not Safe') return colors.danger;
  return colors.pending;
}

// Neutral structure keeps attention on the colored confirmation actions.
export const alertLayout = {
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, ...shadow.card },
  location: { backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  details: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
};
