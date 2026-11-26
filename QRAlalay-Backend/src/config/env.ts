import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    // Fail fast at boot rather than mid-request.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

const nodeEnv = process.env.NODE_ENV;
if (!nodeEnv || !["development", "test", "staging", "production"].includes(nodeEnv)) {
  throw new Error("Set NODE_ENV to development, test, staging, or production before starting the API.");
}

export const env = {
  nodeEnv,
  // Staging and other non-local environments must use production security
  // behavior too; only explicit development/test runs may use dev defaults.
  isProd: nodeEnv !== "development" && nodeEnv !== "test",
  port: optionalInt("PORT", 4000),
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:4000",
  trustProxyHops: optionalInt("TRUST_PROXY_HOPS", nodeEnv === "development" || nodeEnv === "test" ? 0 : 1),

  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  },
  databaseUrl: required("DATABASE_URL"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    // Plain numbers = seconds. jsonwebtoken's `expiresIn` accepts either a
    // number of seconds or a string like "15m" — but @types/jsonwebtoken's
    // string variant is a narrow branded template-literal type that's
    // brittle across versions. Numbers sidestep that entirely.
    accessTtlSeconds: optionalInt("JWT_ACCESS_TTL_SECONDS", 15 * 60), // 15 minutes
    refreshTtlDays: optionalInt("JWT_REFRESH_TTL_DAYS", 30),
  },

  otp: {
    length: optionalInt("OTP_LENGTH", 6),
    developmentCode: process.env.OTP_DEVELOPMENT_CODE ?? "123456",
    ttlMinutes: optionalInt("OTP_TTL_MINUTES", 5),
    maxRequestsPerWindow: optionalInt("OTP_MAX_REQUESTS_PER_WINDOW", 3),
    requestWindowMinutes: optionalInt("OTP_REQUEST_WINDOW_MINUTES", 10),
    maxVerifyAttempts: optionalInt("OTP_MAX_VERIFY_ATTEMPTS", 5),
  },

  sms: {
    apiKey: process.env.SMS_PROVIDER_API_KEY ?? "",
    senderId: process.env.SMS_PROVIDER_SENDER_ID ?? "ResQR",
  },
  email: {
    apiKey: process.env.EMAIL_PROVIDER_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "alerts@resqr.ph",
  },

  expo: {
    // Optional — Expo's push API works without it, but an access token
    // lets Expo verify requests actually come from this project.
    pushAccessToken: process.env.EXPO_PUSH_ACCESS_TOKEN ?? "",
  },

  cors: {
    webDashboardOrigin: process.env.WEB_DASHBOARD_ORIGIN ?? "http://localhost:5173",
    mobileBundleIds: (process.env.MOBILE_APP_BUNDLE_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },

  web: {
    // Base URL of the RESQR-Web app's public, anonymous scan-landing
    // page ([9] in the DFD). Encoded into every generated QR code, so a
    // normal camera/QR-scanner app opens straight to the alert page
    // instead of hitting the raw JSON API. Same app as the CORS origin
    // above today, but kept as its own var since the dispatcher
    // dashboard and the public landing page may end up on different
    // subdomains later.
    publicOrigin: process.env.PUBLIC_WEB_ORIGIN ?? process.env.WEB_DASHBOARD_ORIGIN ?? "http://localhost:5173",
  },

  qr: {
    tokenLengthBytes: optionalInt("QR_TOKEN_LENGTH_BYTES", 24),
    errorCorrection: process.env.QR_LEVEL_Q_ERROR_CORRECTION ?? "Q",
  },

  incident: {
    timeoutMinutes: optionalInt("INCIDENT_TIMEOUT_MINUTES", 10),
    // How long after escalation a guardian-required incident where the
    // responder has already confirmed Safe waits before the system marks
    // the guardian unreachable on its own (scenario: guardian never responds
    // at all). Still requires an official to actually close it.
    guardianGracePeriodMinutes: optionalInt("INCIDENT_GUARDIAN_GRACE_PERIOD_MINUTES", 45),
    // Window after a scan during which the bystander who raised it can
    // cancel a false alarm before anyone needs to act on it.
    cancelWindowMinutes: optionalInt("INCIDENT_CANCEL_WINDOW_MINUTES", 5),
    // A later report for a resident who already has an open alert escalates
    // that alert; its notices go out at most once per this many minutes.
    repeatReportNoticeMinutes: optionalInt("INCIDENT_REPEAT_REPORT_NOTICE_MINUTES", 2),
  },

  // Reverse geocoding for readable incident addresses (OpenStreetMap
  // Nominatim by default; its policy requires an identifying User-Agent).
  bootstrap: {
    secret: process.env.BOOTSTRAP_SECRET ?? "",
  },

  geocoder: {
    url: process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org",
    userAgent: process.env.GEOCODER_USER_AGENT ?? "ResQR emergency alert app",
  },
};

if (env.otp.length < 6 || env.otp.length > 8) {
  throw new Error("OTP_LENGTH must be between 6 and 8 digits.");
}
if (env.port > 65_535) throw new Error("PORT must not exceed 65535.");
if (env.qr.tokenLengthBytes < 16 || env.qr.tokenLengthBytes > 64) {
  throw new Error("QR_TOKEN_LENGTH_BYTES must be between 16 and 64.");
}
if (!new RegExp(`^\\d{${env.otp.length}}$`).test(env.otp.developmentCode)) {
  throw new Error("OTP_DEVELOPMENT_CODE must contain exactly OTP_LENGTH digits.");
}

if (env.isProd) {
  for (const [name, secret] of [
    ["JWT_ACCESS_SECRET", env.jwt.accessSecret],
    ["JWT_REFRESH_SECRET", env.jwt.refreshSecret],
  ] as const) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error(`${name} must contain at least 32 bytes in production.`);
    }
  }
  if (env.jwt.accessSecret === env.jwt.refreshSecret) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different in production.");
  }
  if (env.bootstrap.secret && Buffer.byteLength(env.bootstrap.secret, "utf8") < 32) {
    throw new Error("BOOTSTRAP_SECRET must contain at least 32 bytes in production.");
  }
}

// Every printed QR card holds `${PUBLIC_WEB_ORIGIN}/scan/<token>`. In
// production that must be the real HTTPS website: phones only share location
// over HTTPS, and a wrong address would mean reprinting every card.
if (env.isProd) {
  for (const [name, value] of [["PUBLIC_WEB_ORIGIN", env.web.publicOrigin], ["WEB_DASHBOARD_ORIGIN", env.cors.webDashboardOrigin]] as const) {
    const url = new URL(value);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error(`${name} must be the public https:// website address in production (got ${value}).`);
    }
  }
}
