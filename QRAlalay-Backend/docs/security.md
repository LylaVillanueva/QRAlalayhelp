# Security model and verified findings

## Access boundaries

- `qralalay` is not an exposed PostgREST schema. `anon` and `authenticated` have no schema usage or direct application-table access; `service_role` is the server-side role.
- Client access is through explicit `public` RPCs and Edge Functions. Protected RPCs validate `qralalay.current_profile()`, role, active status, and barangay scope.
- Edge Functions authenticate protected requests. Public QR and assistance routes use narrowly scoped server RPCs, validation, CORS allowlists, and rate limits.
- Public QR data is an allowlist. Resident contact fields, date of birth, instructions, guardian identity, and account status are not part of the public projection.
- Never ship the Supabase service-role key, database URL, encryption key, worker secret, or rate-limit pepper in either client.

## QR credentials

QR credentials are random URL-safe bearer tokens. The database stores a SHA-256 hash for public lookup. For new cards, the Edge Function also stores a versioned AES-256-GCM ciphertext under a key held only in the Edge Function secret store. Card and resident IDs are bound as authenticated encryption data, and the exporter checks the decrypted token against the stored hash. Export is official-only, same-barangay, active-card scoped, and audited.

Legacy cards have only hashes and cannot be re-exported. Do not reverse hashes or silently reissue: issuance revokes the previous active card. Keep `QR_CARD_ENCRYPTION_KEY_V1` backed up securely for as long as cards encrypted with it must be re-exportable.

## Resident data changes

`update_resident_fields` accepts an allowlisted patch; missing keys stay unchanged. Public disclosure approval is excluded and changed only by its separate audited RPC. Full-row legacy update access is revoked in the pending migration to prevent stale screens from overwriting private fields.

Guardian relationship verification and account activation are separate operations. Email confirmation does not verify a guardian link, and link verification does not activate an account.

## Project B read-only checks reported by the owner

The live results shared on 2026-11-26 showed:

- No global or `qralalay`-specific default ACL entries; returned default privileges were tied to named schemas.
- The `ensure_rls` DDL event trigger was enabled.
- `anon` and `authenticated` had no `qralalay` schema usage/create access; `service_role` had schema usage.
- RLS was enabled on all 15 tables in that captured state; there were no anon/authenticated accessible tables. `service_role` had the expected server-side table access.
- Supabase-managed extension ownership remained with Supabase roles.

These checks did not authorize changing Supabase-managed role defaults. No hosted privilege change was made for the current local migration.

## Secret locations

Hosted secrets belong in Project B Edge Function Secrets. Local-only Edge Function test values belong in ignored `supabase/functions/.env`. The root `.env` is ignored, contains legacy local configuration, and was preserved without being opened or moved. Do not copy it into client builds or Git.
