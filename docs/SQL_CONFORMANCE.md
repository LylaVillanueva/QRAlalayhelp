# ResQR database: SQL conformance statement

This document is the conformance statement for the ResQR database schema,
following ISO/IEC 9075-1:2023 (SQL/Framework). It covers the **schema**
(tables, views, columns, constraints, defaults and privileges) as it stands
after migration `016_profile_photos.sql`. It does not cover the SQL that the
backend sends at runtime (see "Out of scope" below).

| | |
|---|---|
| SQL-implementation | PostgreSQL 17 (hosted on Supabase) |
| Schema | `public` |
| Standards followed | ISO/IEC 9075-1:2023 Framework, 9075-2:2023 Foundation, 9075-9:2023 Management of External Data, 9075-11:2023 Information and Definition Schemas |

## Part 1: SQL/Framework

Part 1 defines how conformance is claimed: an SQL-implementation conforms to
Core SQL plus the optional features it lists, and every implementation-defined
or non-conforming element must be stated. This file is that statement. The
remaining deviations are listed, with reasons, under "Deviations".

## Part 2: SQL/Foundation

### Data types

Every column uses a standard data type, except the `uuid` identifiers (see
Deviations).

| Standard type | Used for |
|---|---|
| `CHARACTER VARYING(n)` | all text, including statuses, roles and emails |
| `INTEGER` | counters (`report_count`, `attempts`) |
| `DOUBLE PRECISION` | latitude and longitude |
| `BOOLEAN` | flags (`is_active`, `guardian_required`, `live_location_sharing`) |
| `DATE` | `residents.date_of_birth` |
| `TIMESTAMP WITH TIME ZONE` | every point in time |
| `JSON` | `audit_logs.metadata` |

Every `CHARACTER VARYING(n)` limit is at least as large as the backend's own
input limit (its Zod schemas) and larger than the longest value stored when
migration 012 ran.

### Constraints

* **Primary keys and foreign keys** on every table, with `ON DELETE` actions.
* **Allowed values** are named `CHECK` constraints, e.g.
  `ck_incidents_status CHECK (status IN ('active', 'confirmed_safe', ...))`.
  These replaced PostgreSQL `ENUM` types.
* **Data rules:**
  * Coordinates must be within range (`ck_incidents_scan_latitude`, …).
  * `report_count` must be at least 1.
  * OTP `attempts` can't be negative. The limit itself is the
    `OTP_MAX_VERIFY_ATTEMPTS` setting.
  * Emails must be stored lower-case (`ck_users_email_lowercase`).
* **`UNIQUE` constraints** apply to email, phone number, resident code, push
  token per device, and the bystander cancel code. A standard `UNIQUE`
  constraint treats NULLs as distinct, so incidents without a cancel code
  don't conflict.

### Table design (normalisation)

Each table holds one topic. Incidents are split one-to-one by `incident_id`
(migration 014). A topic row only exists once that topic applies:

| Table | Holds |
|---|---|
| `incidents` | the alert itself: resident, status, scan location and address, notes, report count, timing (15 columns) |
| `incident_responses` | responder assignment, reminder, "can't reach location", the written report |
| `incident_guardian_followups` | guardian reminder and "guardian unreachable" (who, when, why) |
| `incident_outcomes` | who resolved and who closed the alert, and when |
| `incident_cancellations` | the bystander's cancel window, and whether it was used |
| `incident_location_shares` | each bystander's live-location session and latest position |
| `incident_confirmations` | every Safe / Not Safe confirmation |

### Views

`incident_details` (standard `CREATE VIEW`) joins those tables back into one
row per incident, using the original column names. It's the easiest way to
read an incident in full, and the backend reads every incident through it.
Bystander cancel codes are deliberately left out of it. It uses:

* `LEFT JOIN LATERAL` to pick each incident's latest live position (feature
  T491);
* `FETCH FIRST 1 ROW ONLY` and `ORDER BY` in a subquery (features F856 and
  F850).

### Privileges

The `<revoke statement>` removes every table and view privilege from
Supabase's public API roles `anon` and `authenticated` (migrations 013 and
014). All data goes through the backend, which connects as the database
owner.

### Data minimisation

Only data the app uses is stored (migration 015). There is no log of
individual scans, no IP addresses or browser details, and no
emergency-contact phone numbers on residents. Fixed settings (the OTP
attempt limit, the QR error-correction level) live in the app's
configuration, not in every row.

Profile photos (migration 016) aren't stored in the database. Each image
lives in a private Supabase Storage bucket, and `residents.photo_path` /
`users.photo_path` (`CHARACTER VARYING(300)`) only record where it is. The
backend hands out short-lived signed links, and only in responses the
viewer is already allowed to see.

### Defaults

Timestamps default to `CURRENT_TIMESTAMP`. Statuses default to string
literals (for example `'active'`). JSON columns default to `'{}'` or `'[]'`.

### Statement form for schema changes

Migrations from 011 on use only standard schema statements:

* `CREATE TABLE` with named `PRIMARY KEY`, `FOREIGN KEY` and `UNIQUE`
  constraints
* `CREATE VIEW`
* `REVOKE ALL PRIVILEGES … FROM …`

* `ALTER TABLE … ALTER COLUMN … SET DATA TYPE`
* `ALTER TABLE … ALTER COLUMN … SET DEFAULT` and `… DROP DEFAULT`
* `ALTER TABLE … ADD CONSTRAINT` and `… DROP CONSTRAINT`
* `ALTER TABLE … DROP COLUMN … RESTRICT`
* `DROP TYPE … RESTRICT`

Each statement contains **one** action, as the standard requires. Data
fixes use only standard functions: `LOWER`, `SUBSTRING … FROM … FOR`,
`POSITION … IN`.

Optional features relied on (feature IDs from Part 2):

* E011 Numeric data types
* E021 Character string types
* E141 Basic integrity constraints
* F031 Basic schema manipulation
* F033 ALTER TABLE statement: DROP COLUMN clause
* F051 Basic date and time
* F191 Referential delete actions
* F381 Extended schema manipulation
* F411 Time zone specification
* F491 Constraint management
* T031 BOOLEAN data type
* T211 Basic trigger capability
* T491 LATERAL derived table
* F850 Top-level ORDER BY in query expression
* F856 Nested FETCH FIRST in query expression
* T801 JSON data type

## Part 9: SQL/MED (Management of External Data)

The database manages **no external data**. It has:

* no foreign-data wrappers or foreign servers;
* no foreign tables;
* no user mappings;
* no `DATALINK` columns.

The query below returns 0. All outside systems are called by the backend, not
by the database: OpenStreetMap address lookup, Expo push notifications, and
Supabase Auth.

```sql
SELECT COUNT(*) FROM INFORMATION_SCHEMA.FOREIGN_TABLES;
```

If external data is ever linked in, use the Part 9 objects (`CREATE FOREIGN
DATA WRAPPER`, `CREATE SERVER`, `CREATE FOREIGN TABLE`, `CREATE USER MAPPING`)
and record it here.

## Part 11: SQL/Schemata (Information and Definition Schemas)

* `INFORMATION_SCHEMA` fully describes the schema:
  * Column types appear in `COLUMNS` as standard type names.
  * Every allowed value is readable from `CHECK_CONSTRAINTS`. The old enum
    types only appeared as `USER-DEFINED`.
  * Keys appear in `TABLE_CONSTRAINTS`, `KEY_COLUMN_USAGE` and
    `REFERENTIAL_CONSTRAINTS`.
* Project tooling reads the schema through `INFORMATION_SCHEMA`, not through
  PostgreSQL's own catalog. For example, `scripts/run-migrations.js` detects
  an existing database by querying `INFORMATION_SCHEMA.TABLES`.

Useful checks:

```sql
-- every column and its type
SELECT table_name, column_name, data_type, character_maximum_length
FROM INFORMATION_SCHEMA.COLUMNS
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- every allowed-value / data rule
SELECT constraint_name, check_clause
FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS
WHERE constraint_schema = 'public' AND constraint_name LIKE 'ck_%';
```

## Deviations

Each element below is not standard SQL. Each is kept on purpose.

| Element | Where | Why it stays |
|---|---|---|
| `uuid` data type and `gen_random_uuid()` default | every `id` column and every link | The standard has no UUID type or generator. Converting every key and link to `CHARACTER(36)` would slow every lookup and conflict with Supabase, which uses `uuid` throughout. |
| Triggers written in PL/pgSQL | `set_updated_at` (keeps `updated_at` current); `snapshot_incident_guardian` (records whether a guardian must confirm); `validate_resident_guardian` (only guardian accounts can be a resident's guardian) | PostgreSQL can't run triggers written in the standard's own SQL procedure language (SQL/PSM, Part 4). Keeping them in the database means the rules apply to every change, including edits made in the Supabase dashboard. |
| Indexes, including 2 partial unique indexes | `idx_qr_tokens_active_per_resident` (one active QR per resident); `idx_refresh_tokens_user_device` (one live session per device); `idx_incident_responses_responder` | The standard doesn't define indexes. The two partial indexes enforce rules that a standard `UNIQUE` constraint can't express, because they only apply to active rows. |
| Row-level security | 7 tables | Supabase security protection; removing it would expose data through Supabase's public API. |
| Migrations 001–010 | `src/db/migrations` | Already-applied history written in PostgreSQL's dialect. Their end result is converted by 011–012, and applied migrations can't be edited, because the migration tool checks their checksums. |

## Out of scope

The SQL the backend runs at runtime (in `src/services`) uses PostgreSQL's
dialect in places:

* `now()`
* `::type` casts
* `= ANY($1)`
* `INSERT … ON CONFLICT`
* `RETURNING`
* `interval` arithmetic

This statement covers the database schema, not that query code.

## Checklist for new migrations

1. Use standard type names only: `CHARACTER VARYING(n)`, `INTEGER`,
   `BOOLEAN`, `DATE`, `TIMESTAMP WITH TIME ZONE`, `DOUBLE PRECISION`,
   `JSON`. For new identifiers, `uuid` is the one accepted deviation.
2. Use one action per `ALTER TABLE`. Use `RESTRICT` on `DROP COLUMN` and
   `DROP TYPE`. Don't use `IF EXISTS`, `IF NOT EXISTS` or `USING`.
3. Express allowed values as named `CHECK` constraints
   (`ck_<table>_<column>`), never as `ENUM` types.
4. Use `CURRENT_TIMESTAMP`, not `now()`, and standard functions (`LOWER`,
   `SUBSTRING`, `POSITION`, `COALESCE`, `CASE`).
5. Name every constraint so it reads well in `INFORMATION_SCHEMA`.
6. Give each new topic its own table rather than adding columns to an
   existing one. Then `REVOKE ALL PRIVILEGES ON <new table> FROM anon,
   authenticated;`, because Supabase grants its public roles access to every
   new table by default.
7. If something non-standard is unavoidable, add it to "Deviations" above
   with the reason.
