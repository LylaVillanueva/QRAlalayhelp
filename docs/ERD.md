# ResQR entity-relationship diagram

The database as of migration `016_profile_photos.sql`: 16 tables and one
view, in four groups.

| Group | Tables |
|---|---|
| People | `barangays`, `users`, `residents` |
| Alerts | `qr_tokens`, `incidents`, `incident_responses`, `incident_guardian_followups`, `incident_outcomes`, `incident_cancellations`, `incident_confirmations`, `incident_location_shares` |
| Login | `otp_codes`, `otp_request_log`, `refresh_tokens`, `push_tokens` |
| Records | `audit_logs` |

The view `incident_details` joins `incidents` with its five topic tables
(responses, guardian follow-ups, outcomes, cancellations, latest live
location) into one row per alert, using the original column names.
`schema_migrations` (which migrations have run) is not shown.

Notation: `||` exactly one, `o|` zero or one, `o{` zero or more.
PK = primary key, FK = links to another table, UK = must be unique.

```mermaid
erDiagram
  barangays |o--o{ users : "has staff & guardians"
  barangays ||--o{ residents : "has residents"
  users |o--o{ residents : "guardian of"
  users ||--o{ residents : "enrolled"
  residents ||--o{ qr_tokens : "has QR cards"
  users ||--o{ qr_tokens : "issued"
  residents ||--o{ incidents : "alert for"
  qr_tokens |o--o{ incidents : "scanned"
  incidents ||--o| incident_responses : "response"
  incidents ||--o| incident_guardian_followups : "guardian follow-up"
  incidents ||--o| incident_outcomes : "outcome"
  incidents ||--o| incident_cancellations : "cancel window"
  incidents ||--o{ incident_confirmations : "confirmations"
  incidents ||--o{ incident_location_shares : "live location"
  users ||--o{ incident_responses : "responder, assigned by"
  users |o--o{ incident_guardian_followups : "marked unreachable"
  users |o--o{ incident_outcomes : "resolved, closed by"
  users ||--o{ incident_confirmations : "submitted"
  users ||--o{ refresh_tokens : "sessions"
  users ||--o{ push_tokens : "devices"
  users |o--o{ audit_logs : "did"
  barangays {
    uuid id PK "required"
    varchar name "150 chars, required"
    varchar municipality "150 chars, required"
    varchar province "150 chars, required"
    timestamptz created_at "required"
  }
  users {
    uuid id PK "required"
    varchar role "30 chars, required"
    varchar full_name "150 chars, required"
    varchar phone_number UK "20 chars"
    varchar email UK "254 chars"
    boolean is_active "required"
    uuid barangay_id FK
    timestamptz created_at "required"
    timestamptz updated_at "required"
    varchar position "100 chars"
    varchar home_address "300 chars"
    varchar photo_path "300 chars"
  }
  residents {
    uuid id PK "required"
    varchar full_name "150 chars, required"
    date date_of_birth
    varchar medical_notes "2000 chars"
    varchar home_address "300 chars"
    uuid guardian_id FK
    uuid enrolled_by FK "required"
    uuid barangay_id FK "required"
    boolean is_active "required"
    timestamptz created_at "required"
    timestamptz updated_at "required"
    varchar resident_type "50 chars"
    varchar resident_code UK "50 chars"
    varchar guardian_relationship "100 chars"
    varchar photo_path "300 chars"
  }
  qr_tokens {
    varchar token PK "64 chars, required"
    uuid resident_id FK "required"
    varchar status "20 chars, required"
    uuid issued_by FK "required"
    timestamptz created_at "required"
    timestamptz revoked_at
  }
  incidents {
    uuid id PK "required"
    uuid resident_id FK "required"
    varchar qr_token FK "64 chars"
    varchar status "30 chars, required"
    double scan_latitude
    double scan_longitude
    varchar bystander_notes "10000 chars"
    timestamptz timeout_at
    timestamptz escalated_at
    timestamptz created_at "required"
    timestamptz updated_at "required"
    boolean guardian_required "required"
    integer report_count "required"
    timestamptz last_reported_at
    varchar scan_address "500 chars"
  }
  incident_responses {
    uuid incident_id PK, FK "required"
    uuid responder_id FK "required"
    uuid assigned_by FK "required"
    timestamptz assigned_at "required"
    timestamptz reminded_at
    timestamptz unreachable_at
    varchar unreachable_reason "500 chars"
    uuid report_submitted_by FK
    timestamptz report_submitted_at
    varchar final_action_summary "2000 chars"
  }
  incident_guardian_followups {
    uuid incident_id PK, FK "required"
    timestamptz reminded_at
    timestamptz unreachable_at
    uuid unreachable_by FK
    varchar unreachable_reason "500 chars"
  }
  incident_outcomes {
    uuid incident_id PK, FK "required"
    uuid resolved_by FK
    timestamptz resolved_at
    uuid closed_by FK
    timestamptz closed_at
  }
  incident_cancellations {
    uuid incident_id PK, FK "required"
    varchar cancel_token UK "64 chars"
    timestamptz cancellable_until
    timestamptz cancelled_at
    varchar cancelled_reason "100 chars"
  }
  incident_confirmations {
    uuid id PK "required"
    uuid incident_id FK "required"
    varchar source "30 chars, required"
    uuid submitted_by FK "required"
    varchar decision "20 chars, required"
    varchar summary_notes "1000 chars"
    timestamptz created_at "required"
  }
  incident_location_shares {
    varchar token PK "64 chars, required"
    uuid incident_id FK "required"
    timestamptz created_at "required"
    timestamptz last_shared_at
    timestamptz stopped_at
    double latitude
    double longitude
    varchar address "500 chars"
    double address_latitude
    double address_longitude
  }
  otp_codes {
    uuid id PK "required"
    varchar identifier "254 chars, required"
    varchar channel "10 chars, required"
    varchar purpose "20 chars, required"
    varchar otp_hash "255 chars, required"
    timestamptz expires_at "required"
    integer attempts "required"
    timestamptz consumed_at
    timestamptz created_at "required"
  }
  otp_request_log {
    uuid id PK "required"
    varchar identifier "254 chars, required"
    varchar requester_ip "45 chars"
    timestamptz created_at "required"
  }
  refresh_tokens {
    uuid id PK "required"
    uuid user_id FK "required"
    varchar token_hash "128 chars, required"
    varchar device_id "255 chars, required"
    varchar platform "20 chars, required"
    timestamptz created_at "required"
    timestamptz revoked_at
  }
  push_tokens {
    uuid id PK "required"
    uuid user_id FK, UK "required"
    varchar device_id UK "255 chars, required"
    varchar push_token "255 chars, required"
    varchar platform "20 chars, required"
    timestamptz created_at "required"
    timestamptz updated_at "required"
  }
  audit_logs {
    uuid id PK "required"
    uuid actor_id FK
    varchar actor_role "30 chars"
    varchar action "100 chars, required"
    varchar entity_type "50 chars, required"
    uuid entity_id
    json metadata "required"
    timestamptz created_at "required"
  }
```
