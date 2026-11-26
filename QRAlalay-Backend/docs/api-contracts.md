# Backend API contracts

All client calls target Project B. Authenticated calls include the Supabase user JWT and publishable key. Protected RPCs require an active official and enforce barangay scope; public Edge Functions accept no user identity and apply their own validation and rate limits.

## Resident editing

- `get_resident_for_edit(p_resident_id uuid)` returns one row with `resident_id`, `full_name`, `display_name`, `phone`, `address`, `resident_category`, `date_of_birth`, `assistance_instructions`, `public_disclosure_approved`, `disclosure_reference`, and `registration_status`.
- `get_resident_edit_details(p_resident_id uuid)` returns those fields plus disclosure audit metadata, photo path, verified guardian details, and active QR card metadata.
- `update_resident_fields(p_resident_id uuid, p_changes jsonb)` updates only supplied keys and returns the full edit-details row. Allowed keys: `full_name`, `phone`, `address`, `resident_category`, `display_name`, `assistance_instructions`, `date_of_birth`. Omitted keys are unchanged. For optional text fields, JSON `null` or `""` clears the value; use JSON `null` to clear `date_of_birth`. Full name cannot be cleared.
- `set_resident_public_disclosure(p_resident_id uuid, p_approved boolean, p_disclosure_reference text, p_reason text)` is the separate audited operation for consent. A reason is required; approval requires a reference.

Do not use the legacy full-replacement update RPC for ordinary edits. It is revoked by the pending migration to prevent stale forms from overwriting unrelated resident fields. Clients must use `update_resident_fields`; a deployment gap is not a reason to fall back to a destructive full-row update. If the RPC is unavailable, surface a retryable error and wait for backend deployment.

## Guardian and account verification

- `create_guardian_link(p_resident_id uuid, p_guardian_profile_id uuid, p_relationship text)` creates a pending relationship.
- `list_resident_guardian_links(p_resident_id uuid)` returns pending and verified links: `link_id`, `guardian_profile_id`, `guardian_name`, `guardian_phone`, `guardian_email`, `guardian_is_active`, `guardian_email_confirmed`, `relationship`, `status`, `created_at`, and `verified_at`. Revoked links are omitted.
- `review_guardian_link(p_link_id uuid, p_decision text, p_reason text)` accepts `verified` or `revoked`, requires a reason, and is an official same-barangay action.
- `list_barangay_profiles_with_status()` returns `profile_id`, `email_confirmed`, and `has_auth_user` for the caller’s barangay.

Email confirmation and relationship verification are separate: confirming an Auth account does not verify its resident link, and verifying a link does not activate the account.

## QR cards

- `get_resident_qr_card(p_resident_id uuid)` returns the active card only: `card_id`, `status`, `issued_at`, `issued_by_name`. It never returns the token or hash.
- `issue-qr-card` accepts `POST { "residentId": "<uuid>" }`; it requires an authenticated official and returns `{ data: { cardId, token, publicUrl } }` once for printing/saving the initial card.
- `export-qr-card` accepts either `{ "residentId": "<uuid>" }` (preferred) or `{ "cardId": "<uuid>" }` (current mobile client). It returns `{ data: { cardId, publicUrl } }` for an authorized active card. It never issues or replaces a card. Older cards return HTTP 409 `QR_EXPORT_UNAVAILABLE`; retain the printed card or deliberately issue a replacement.

The export URL contains the bearer token. Treat it as sensitive, use HTTPS, and do not log or persist it. Both functions require JWT verification; do not deploy them with `--no-verify-jwt`.

## Public assistance and website

The public website calls the existing Edge Functions directly:

- `public-qr-view` — `{ token }`
- `submit-assistance-request` — `{ token, idempotencyKey, requestToken, locationToken, publicNote?, locationDescription?, latitude?, longitude?, accuracyMeters? }`
- `public-assistance-status` — `{ requestToken }`
- `cancel-assistance-request` — `{ requestToken }`
- `location-share` — `{ action: "start" | "update" | "stop", locationToken, latitude?, longitude?, accuracyMeters? }`

These existing function identifiers and public response shapes remain unchanged.
