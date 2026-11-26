# Historical Express Backend Guide

This is the preserved Express setup and API reference. Project B's active Supabase architecture and contracts are documented at `../../../docs/`. Do not treat this file as the active mobile or website API contract.

Node.js (TypeScript/Express) API for the ResQR platform — OTP-only auth
with persistent mobile sessions, resident QR enrolment, and the
emergency alert/dispatch lifecycle, backed by PostgreSQL via Supabase.

This implementation follows the four ResQR diagrams directly:
- **Context diagram** — the four registered roles (guardian,
  barangay_official, barangay_responder) plus the anonymous bystander,
  and every numbered data flow `[1]`–`[14]`.
- **Data Flow Diagram** — the `ALERT`, `CONFIRMATIONS`, `RESIDENTS`,
  and `PROFILES` stores map 1:1 to `incidents`, `incident_confirmations`,
  `residents`, and `users` tables; the "Automated Timeout Engine" and
  "QR Generation Engine" map to `src/jobs/timeout-engine.ts` and
  `src/services/qr.service.ts`.
- **Use-case diagram** — every use case (Scan QR Card, Assign Responder
  to Incident, Submit Safe/Not Safe Confirmation, etc.) has a
  corresponding route + service function; comments in the code
  reference the bracketed step numbers.

## 1. Project Structure

```
resqr-backend/
├── src/
│   ├── app.ts                  # Express app assembly (middleware, routes)
│   ├── server.ts                # HTTP + Socket.io bootstrap, graceful shutdown
│   ├── config/
│   │   └── env.ts               # Centralized, validated environment config
│   ├── db/
│   │   ├── pool.ts              # pg Pool + Supabase admin client + tx helper
│   │   └── migrations/
│   │       └── 001_init.sql     # Full DDL schema
│   ├── types/
│   │   └── domain.ts            # Shared TS types, Express Request augmentation
│   ├── utils/
│   │   ├── crypto.ts            # OTP generation, hashing, token generation
│   │   ├── errors.ts            # AppError (typed HTTP errors)
│   │   └── logger.ts            # pino logger w/ redaction
│   ├── services/                # All business logic lives here
│   │   ├── otp.service.ts       # OTP issue/verify + rate limiting
│   │   ├── token.service.ts     # Dual-token JWT + persistent device sessions
│   │   ├── auth.service.ts      # Login/signup orchestration
│   │   ├── notification.service.ts  # SMS/email/push provider stubs
│   │   ├── audit.service.ts     # Append-only audit log writes/reads
│   │   ├── resident.service.ts  # Resident (ward) enrolment & profile
│   │   ├── qr.service.ts        # QR generation + sanitized public view
│   │   ├── incident.service.ts  # Full alert lifecycle (create→close)
│   │   └── realtime.ts          # In-process event bus (services -> sockets)
│   ├── middlewares/
│   │   ├── auth.ts              # JWT verification -> req.user
│   │   ├── rbac.ts              # Role-based route gating
│   │   ├── validate.ts          # Zod request validation
│   │   ├── rate-limit.ts        # express-rate-limit configs
│   │   └── error-handler.ts     # Centralized, sanitized error responses
│   ├── controllers/             # Thin HTTP adapters over services
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── qr.controller.ts
│   │   └── incident.controller.ts
│   ├── routes/
│   │   ├── index.ts             # Mounts all routers under /api
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── qr.routes.ts
│   │   ├── incident.routes.ts
│   │   ├── audit.routes.ts
│   │   └── schemas/             # Zod schemas per route group
│   ├── sockets/
│   │   └── index.ts             # Socket.io auth + room-based event fan-out
│   └── jobs/
│       └── timeout-engine.ts    # Auto-escalates unconfirmed alerts
├── package.json
├── tsconfig.json
└── .env.example
```

## 2. Setup

```bash
npm install
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, and both JWT secrets.
```

Run the schema against your Supabase Postgres instance:

```bash
psql "$DATABASE_URL" -f src/db/migrations/001_init.sql
```

(Or paste the file into the Supabase SQL Editor.)

Seed at least one barangay so officials can be created against it:

```sql
insert into barangays (name, municipality, province) values ('Barangay Uno', 'Sample City', 'Sample Province');
```

## 3. Run

```bash
npm run dev     # tsx watch — hot reload
npm run build   # tsc + tsc-alias -> dist/
npm start        # node dist/server.js
```

The API listens on `PORT` (default `4000`), mounted under `/api`.
Health check: `GET /api/health`.

## 4. Authentication flow (client-facing)

1. `POST /api/auth/send-otp` `{ channel: "phone" | "email", identifier }`
   → rate-limited (`OTP_MAX_REQUESTS_PER_WINDOW` per identifier/IP per
   `OTP_REQUEST_WINDOW_MINUTES`), OTP expires in `OTP_TTL_MINUTES`. Only
   development/test uses `OTP_DEVELOPMENT_CODE`; production sends random
   codes through the configured provider.
2. `POST /api/auth/verify-otp` `{ channel, identifier, otp, device: { deviceId, platform }, signup? }`
   - The identifier must already belong to an active account provisioned
     by a barangay official.
   - Returns `{ user, accessToken, refreshToken, expiresIn }`.
3. Mobile clients store the refresh token securely (e.g. Expo
   SecureStore) and never need to re-OTP: call `POST /api/auth/refresh`
   `{ refreshToken }` whenever the access token expires. Each call
   **rotates** the refresh token — always persist the new one returned.
4. `POST /api/auth/logout` (authenticated) revokes only the calling
   device's session; other devices stay logged in.

Bystanders never authenticate — the QR scan flow (`/api/qr/:token/*`)
is fully anonymous by design.

## 5. Key design decisions (ADRs, informal)

- **Refresh token reuse detection**: if a refresh token whose DB row is
  already `revoked_at` is presented again, every active session for
  that user is revoked. This catches token theft where an attacker
  races a legitimate rotation.
- **RLS as backstop, not primary enforcement**: `SUPABASE_SERVICE_ROLE_KEY`
  bypasses Row Level Security, so authorization is enforced in
  `src/middlewares/rbac.ts` and per-service ownership checks (e.g. a
  guardian can only see incidents for their own linked residents). RLS
  is enabled on every table with no permissive policies, so a
  misconfigured client using an anon key gets nothing by default.
- **Data minimization on the public QR view**: `qr.service.ts#getPublicQrView`
  is an explicit allow-list (first name, blood type, allergies,
  medical notes, emergency contacts) — it never spreads the full
  `residents` row, so a new column added to the table can't
  accidentally leak onto the public landing page.
- **Timeout engine as a simple interval**: fine for a single instance;
  for horizontal scaling, replace `src/jobs/timeout-engine.ts` with a
  single external scheduler (cron-triggered Supabase Edge Function or
  a dedicated worker) so escalation doesn't run N times per poll.

## 6. Mobile account management

Apply the additive migration to an existing database (do not replay `001_init.sql`):

```sh
npm run migrate -- 004_account_management.sql
npm test
npm run build
```

The migration adds official position and guardian relationship metadata. The migration runner records checksums and applies each file transactionally.

All account-management routes require a barangay official and scope records to their barangay:

- `GET /api/users/accounts` — complete directory, including inactive accounts.
- `POST /api/users/accounts` — create a guardian, official, or responder; optionally assign a guardian’s wards.
- `PATCH /api/users/accounts/:userId` — edit name, phone, email, or position.
- `PATCH /api/users/accounts/:userId/role` — change role.
- `PATCH /api/users/accounts/:userId/status` — activate/deactivate using `{ isActive }`.

Writes and audit events are transactional. Access changes revoke refresh tokens and disconnect active sockets; HTTP and socket authentication reject inactive accounts and stale roles. Officials cannot remove their own access, the last official cannot be removed, and active guardian wards/responder assignments prevent access removal until reassigned. Unit tests cover these service boundaries using an injected database; they do not replace database integration tests.

Authenticated devices can register/unregister via `POST`/`DELETE /api/users/push-token`. Expo push dispatch is best-effort and requires native client credentials/configuration; Expo Go does not register for remote push.

## 7. Remaining integrations

- SMS provider integration; phone OTP is unavailable in production until a
  real provider is implemented. Email uses Resend and requires the configured
  `sign-up-confirmation` template.
- Push delivery receipts/retries and server-side notification category preferences.
- File/photo upload for resident enrollment photos.
- Database integration tests and OpenAPI documentation.

### Incident review when no guardian is registered

Apply before starting the updated backend:

```sh
npm run migrate -- 005_incident_review.sql
```

The guardian requirement is captured when the alert is created. Removing a guardian later does not waive confirmation. Existing incidents are backfilled from the current resident record; historical closed incidents are not reopened.

With a guardian, both guardian and assigned responder must confirm Safe. Without one, the assigned responder confirms Safe and submits a report, then a barangay official in the same barangay explicitly reviews and closes the incident. Reports alone cannot close an alert. Any current Not Safe blocks closure. Reassignment clears report approval eligibility and requires a fresh responder confirmation. Unconfirmed assigned alerts also escalate on timeout.
# QRAlalay
