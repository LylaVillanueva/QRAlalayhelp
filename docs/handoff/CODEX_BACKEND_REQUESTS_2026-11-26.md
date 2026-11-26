# Backend requests from the mobile integration (2026-11-26)

For: Codex (backend owner, `QRAlalay-Backend`). From: the mobile integration session.
The mobile app (`QRAlalay-Mobile`) already calls the functions below by these exact
names and argument names. Until they are deployed to Project B
(`jmzpqfgbjigbxkuofaae`), the app shows "requires a backend update" instead of
the feature. Nothing here changes existing functions or grants.

All new functions: `security definer`, `set search_path = ''`, require the
caller's active **official** profile via `qralalay.current_profile()`, scope to
the caller's barangay, `revoke all ... from public, anon`, `grant execute ... to authenticated`.
Read-only functions need no audit row; any write must insert into
`qralalay.audit_logs` as the existing functions do.

## 1. Pending and verified guardian links for one resident

Why: `create_guardian_link` stores links as `pending`, and
`review_guardian_link(p_link_id, ...)` needs the link id, but no function returns
link ids or pending links. Links created by `invite-account` can never be
verified from the app today.

```sql
public.list_resident_guardian_links(p_resident_id uuid)
returns table(
  link_id uuid, guardian_profile_id uuid, guardian_name text,
  guardian_phone text, guardian_email text,
  guardian_is_active boolean, guardian_email_confirmed boolean,
  relationship text, status text,          -- 'pending' | 'verified' | 'revoked'
  created_at timestamptz, verified_at timestamptz
)
```
`guardian_email` comes from `qralalay.profile_invitation_emails`;
`guardian_email_confirmed` = `auth.users.email_confirmed_at is not null` for the
profile's `auth_user_id` (false when no Auth user is linked). Exclude `revoked`
or return it; the app hides revoked rows.

## 2. Email-confirmed flag for accounts

Why: the official must see whether an invited guardian/responder has confirmed
their email before activating them (`set_profile_active` already refuses
unconfirmed accounts).

```sql
public.list_barangay_profiles_with_status()
returns table(profile_id uuid, email_confirmed boolean, has_auth_user boolean)
```
A separate function avoids changing the return type of
`list_barangay_profiles_with_photos`. The app joins on `profile_id`.

## 3. Full resident record for safe editing

Why: `update_resident_with_birth_date` overwrites every column, but no function
returns `assistance_instructions`, `public_disclosure_approved` or
`disclosure_reference`. The app currently preserves phone, address, category,
display name and birth date, but cannot preserve those three.

```sql
public.get_resident_for_edit(p_resident_id uuid)
returns table(
  resident_id uuid, full_name text, display_name text, phone text, address text,
  resident_category text, date_of_birth date, assistance_instructions text,
  public_disclosure_approved boolean, disclosure_reference text,
  registration_status text
)
```
The app will read this, change only the edited fields, and pass every other
value back unchanged. It never changes `public_disclosure_approved` from the
edit screen.

## 4. Active QR card status (no token)

Why: after leaving the QR screen the app cannot tell whether a resident has an
active card, so it cannot label "Generate" vs "Replace" or revoke the current card.

```sql
public.get_resident_qr_card(p_resident_id uuid)
returns table(card_id uuid, status text, issued_at timestamptz, issued_by_name text)
```
Return the active card only (or no row). Never return `token_hash`.

## 5. Authorized re-export of the existing QR card (decision needed)

Why: tokens are stored only as SHA-256 hashes, so a printed card cannot be
re-exported; today the only option is to replace it, which invalidates the
printed card.

Suggested design (needs owner approval; it stores a recoverable secret):
- New nullable columns on `qralalay.qr_cards`: `token_ciphertext bytea`,
  `token_nonce bytea`. Encrypt the raw token with AES-256-GCM inside
  `issue-qr-card` using a new Edge Function secret `QR_CARD_ENCRYPTION_KEY_V1`
  (32 random bytes, base64). The key never reaches the database or clients.
- New authenticated Edge Function `export-qr-card`, body `{ residentId }`:
  checks the caller is an active official of the resident's barangay (through
  an RPC such as `public.get_active_qr_card_ciphertext(p_resident_id)`, which
  also writes an audit row `qr_card.exported`), decrypts, and returns
  `{ data: { cardId, publicUrl } }` with `Cache-Control: no-store`. Never log
  the token or URL.
- Cards issued before this change have no ciphertext; return
  `409 QR_EXPORT_UNAVAILABLE` and the app will ask the official to replace the card.

If this is not approved, the app keeps the current behaviour: save/share only
right after issuing, and "Replace QR Card" (with a warning) afterwards.

## Mobile status
- Mobile calls #1–#4 by these names; #5 via `supabase.functions.invoke('export-qr-card', { body: { residentId } })`.
- A missing function (PostgREST `PGRST202` / HTTP 404) is treated as "backend update pending", not as an error.

## Update — functional review (2026-11-26, later)

Live check of Project B (read-only, anonymous RPC probes + `supabase migration list`):
`20261126002457_resident_patch_and_qr_reexport.sql` is **not applied**, and
`export-qr-card` is **not deployed**. Everything else the app calls exists and
rejects anonymous callers. `PUBLIC_SITE_ORIGIN` = `https://www.qralalay.app` (digest match).

**Deploy these together or not at all.** The migration revokes
`issue_qr_card` from `authenticated`. The deployed `issue-qr-card` (v1) still
calls `issue_qr_card`, so applying the migration alone breaks QR generation.
Required together:
1. Set Edge Function secret `QR_CARD_ENCRYPTION_KEY_V1`. It is not set today.
2. Apply `20261126002457`.
3. Deploy the local `issue-qr-card` (calls `issue_qr_card_secure`) and `export-qr-card`.

What the mobile app does until then:
- It shows "Issue QR Card" (always a replacement, with a warning) instead of re-exporting.
- It cannot list pending guardian links. New guardians are now invited **without**
  `wardIds`, then linked with `create_guardian_link` and verified by the returned
  link id, so no new unverifiable links are created.
- Resident edits use the `update_resident_with_birth_date` fallback. That call resets
  `assistance_instructions` and `public_disclosure_approved` to empty/false.
  Residents created in the app never set these, but residents created elsewhere would lose them.

No new functions are requested.

## Coordination items for the next backend deploy (mobile checkpoint `1a8d1aa`)

Mobile branch `checkpoint/functional-simplification-2026-11-26` (local only, not pushed).
The mobile app is ready for every item below; no mobile release until they pass live tests.

### A. Secure QR re-export (deploy as one unit)
`QR_CARD_ENCRYPTION_KEY_V1` secret → migration `20261126002457` → `issue-qr-card` (local, calls
`issue_qr_card_secure`) + `export-qr-card`. Mobile contract, already implemented:
- `get_resident_edit_details(p_resident_id)` → `qr_card_id`, `qr_card_issued_at`, `qr_card_reexportable`.
- `functions.invoke('export-qr-card', { body: { cardId } })` → `{ data: { cardId, publicUrl } }`.
  On 404/409 the app tells the official to replace the card. The local function accepts `cardId`, so the two match.
- Cards issued before the deploy have no ciphertext and cannot be re-exported (expected).

### B. Pending guardian relationships
Mobile calls `list_resident_guardian_links(p_resident_id)` and verifies a link with
`review_guardian_link(link_id, 'verified', reason)`. New guardian invitations from the app
no longer pass `wardIds`; the app creates the link itself and verifies it by the id it gets back.

### C. Guardian verification
No new function is needed. Please confirm in the live test: a guardian whose link is `pending`
cannot see the resident or its cases, and gains access only after `review_guardian_link` → `verified`.

### D. Responder history authorization (new; please decide and implement)
`qralalay.can_view_resident` grants a responder access to a resident whenever the responder has
**any** `pending_acceptance`/`accepted`/`completed` assignment on **any** of that resident's cases.
Two consequences:
1. `list_resident_case_history` returns **every** case of the resident to that responder,
   including cases they were never assigned to.
2. `list_accessible_residents_with_photos` keeps returning the resident, with guardian name and phone,
   permanently after a completed assignment.

Request: for the responder role, scope `list_resident_case_history` to cases where the caller has
an assignment, and consider limiting resident and guardian contact visibility to
`pending_acceptance`/`accepted` assignments. The app already filters history to the responder's
own cases on screen, but that is a display filter, not a security control.

### E. Resident edit
The mobile full-row fallback is **removed** (commit `1a8d1aa`). Until `update_resident_fields` is live,
saving a resident edit shows "needs a backend update" and changes nothing.

### F. After deploying, please send the mobile session
- the migration list and function versions;
- confirmation that `issue_qr_card` (old) is revoked and `issue-qr-card` issues re-exportable cards.
