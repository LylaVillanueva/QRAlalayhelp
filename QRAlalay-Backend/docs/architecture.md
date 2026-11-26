# Architecture

## Active backend

Project B (`jmzpqfgbjigbxkuofaae`) is the production target. Supabase Auth authenticates users. Application data lives in the private `qralalay` schema. Mobile and website clients use a publishable key; they access protected data through authenticated public RPCs and Edge Functions, not direct table access.

```text
Mobile app ── Supabase Auth + authenticated RPCs ──┐
                                                   ├── Project B
Website ── public QR/assistance Edge Functions ────┘   ├── Auth
                                                       ├── public RPC boundary
                                                       ├── private qralalay tables
                                                       └── notification worker
```

Public scan and assistance endpoints validate opaque tokens, apply rate limits, and return allowlisted information. Official, guardian, and responder workflows use user JWTs and barangay-scoped database functions. Notifications are queued in the database and processed by the protected worker.

## Legacy compatibility

`src/`, `tests/`, `scripts/`, and the root npm package are the older Express backend. The mobile client still contains an Express fallback, but its current `.env` selects Supabase. The website calls Supabase Edge Functions directly. Keep Express recoverable until the complete live workflow and database recovery have been accepted; then move its source, migrations, tests, scripts, config, package files, and recovery documentation together into the archive.

## Change boundaries

- Do not edit or rename already-applied migration files.
- Add database changes as timestamped migrations.
- Do not rename deployed function identifiers or the private schema.
- Do not point Project B changes at Project A.
- Keep frontend code in its own repository and preserve its existing UI.
