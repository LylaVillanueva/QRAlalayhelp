# Project B database ERD

The application schema is private `qralalay`. `public` contains the small RPC boundary exposed through Supabase PostgREST. The diagram shows major relationships; audit and worker tables are included even where they do not participate in a user-facing flow.

```mermaid
erDiagram
  BARANGAYS ||--o{ PROFILES : scopes
  BARANGAYS ||--o{ RESIDENTS : scopes
  BARANGAYS ||--o{ BARANGAY_CONTACTS : has
  PROFILES ||--o{ RESIDENTS : registers
  RESIDENTS ||--o{ GUARDIAN_LINKS : has
  PROFILES ||--o{ GUARDIAN_LINKS : guardian
  RESIDENTS ||--o{ QR_CARDS : receives
  PROFILES ||--o{ QR_CARDS : issues
  RESIDENTS ||--o{ ASSISTANCE_CASES : subject
  QR_CARDS ||--o{ ASSISTANCE_CASES : scanned_for
  ASSISTANCE_CASES ||--o{ CASE_ASSIGNMENTS : assigned
  PROFILES ||--o{ CASE_ASSIGNMENTS : responder
  ASSISTANCE_CASES ||--o{ SAFETY_OBSERVATIONS : observed
  ASSISTANCE_CASES ||--o{ CASE_REPORTS : reported
  ASSISTANCE_CASES ||--o{ CASE_EVENTS : records
  PROFILES ||--o{ DEVICE_TOKENS : registers
  PROFILES ||--o{ NOTIFICATIONS : receives
  CASE_EVENTS ||--o{ NOTIFICATIONS : triggers
  NOTIFICATIONS ||--o{ NOTIFICATION_OUTBOX : queues
  ASSISTANCE_CASES ||--o{ CASE_REQUEST_CREDENTIALS : requested_by
  ASSISTANCE_CASES ||--o{ CASE_LOCATION_SHARES : location
  PROFILES ||--o{ AUDIT_LOGS : acts
  PROFILES ||--o| PROFILE_INVITATION_EMAILS : invited_by_email
  PROFILES ||--o| PROFILE_INVITATION_PHONES : invited_by_phone
```

## Data groups

- **Identity and scope:** `barangays`, `profiles`, `profile_invitation_emails`, `profile_invitation_phones`.
- **Resident and QR:** `residents`, `guardian_links`, `qr_cards`, `barangay_contacts`.
- **Assistance workflow:** `assistance_cases`, `case_assignments`, `safety_observations`, `case_reports`, `case_events`.
- **Notifications:** `device_tokens`, `notifications`, `notification_outbox`.
- **Public request controls:** `case_request_credentials`, `case_location_shares`, `public_request_buckets`.
- **Audit:** `audit_logs`.

The encrypted QR token column is nullable. Existing cards have no recoverable token and remain scan-valid through their stored hash; newly issued cards can be re-exported only while the versioned Edge secret is retained.
