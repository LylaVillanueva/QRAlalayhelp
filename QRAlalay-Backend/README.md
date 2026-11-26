# QRAlalay Backend

Project B (`jmzpqfgbjigbxkuofaae`) is the intended permanent backend. The active service uses Supabase Postgres, Auth, public RPCs, and Edge Functions. Mobile and website source live in the sibling `RESQR-Mobile/` and `RESQR-Web/` repositories.

## Current state

Live CLI verification on 2026-11-26 confirmed that the first 12 local migrations are recorded on Project B. Exactly three migrations remain pending: `20261126002457_resident_patch_and_qr_reexport.sql`, `20261126010000_role_scoped_responder_history.sql`, and `20261126011000_case_report_review_at_closure.sql`. Eight Edge Functions are active; the hosted `issue-qr-card` is the old implementation and `export-qr-card` is not deployed. The updated QR function and export function require approval before deployment.

The legacy Express implementation remains available for rollback until Project B passes live workflow and recovery acceptance. It has not been retired.

## Repository map

```text
QRAlalay-Backend/
├── docs/                         Architecture, ERD, API, deployment, security, tests
├── scripts/                      Legacy Express scripts; retain until Express is archived
├── src/                           Legacy Express backend; retain for rollback
├── tests/                         Legacy Express tests; retain for rollback
├── supabase/
│   ├── functions/                 Edge Function source
│   ├── migrations/                12 remotely recorded migrations plus three pending migrations
│   ├── tests/database/            pgTAP security and workflow tests
│   ├── snippets/                  Review queries and SQL helpers
│   ├── legacy_reference/          Historical SQL and Express reference docs
│   ├── config.toml
│   └── supabase.lock
├── package.json                   Legacy Express scripts and installed Supabase CLI
└── .env.example                   Local-only template; never put secrets in Git
```

See [architecture](docs/architecture.md), [API contracts](docs/api-contracts.md), [security](docs/security.md), and [testing](docs/testing.md).

## Requirements and startup

Use the checked-in Supabase CLI 3.4.0. No package install or Docker image is needed for hosted read-only checks, migration preview, or Docker-free function deployment.

```sh
./node_modules/.bin/supabase --version
./node_modules/.bin/supabase config validate
```

The hosted Supabase backend has no long-running local API server to start. Mobile and website builds connect directly to Project B with the publishable key. `npm run dev` starts only the legacy Express fallback; do not start it against an unverified database target.

## Deployment

Review [deployment steps](docs/deployment.md). Hosted database writes, secret changes, and function deployment require the Project B owner’s approval. Never use Project A for this backend.

## Archive policy

Keep the Express source, migrations, tests, package files, and recovery data until the resident, QR, guardian, assistance, responder, report, closure, and recovery workflows pass live acceptance. See the [legacy reference](supabase/legacy_reference/README.md).
