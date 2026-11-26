# Mobile integration handoff: backend contracts

This note is for the mobile integration owner. Backend files are the source of
truth; do not use a destructive compatibility fallback for a missing RPC.

## Release snapshot (2026-11-26)

Live Project B verification found the first 12 migrations applied and only
`20261126002457`, `20261126010000`, and `20261126011000` pending. Eight Edge
Functions are active; hosted `issue-qr-card` is still the older implementation
and `export-qr-card` is not deployed. The updated issue/export pair requires
`QR_CARD_ENCRYPTION_KEY_V1`, which was absent at verification. Do not set or
rotate it before the owner approves the single coordinated release. The three
pending database suites have not run; use the no-data Preview Branch procedure
in `docs/deployment.md`, never Project B production, for those tests.

## Resident editing

Call `public.update_resident_fields(p_resident_id uuid, p_changes jsonb)`.
`p_changes` is a non-empty object and may contain only:

- `full_name`
- `phone`
- `address`
- `resident_category`
- `display_name`
- `assistance_instructions`
- `date_of_birth`

Omitted keys remain unchanged. Explicit JSON `null` clears optional text and
date-of-birth values. `full_name` must be non-empty when supplied. The function
does not accept `public_disclosure_approved`, its reference, guardian fields,
QR fields, or registration status. Disclosure decisions use
`public.set_resident_public_disclosure(p_resident_id, p_approved,
p_disclosure_reference, p_reason)` and remain an explicit audited official
action.

The caller must have an active official profile in the resident's barangay.
The patch updates only supplied fields, preserves guardian links and QR cards,
and writes `resident.updated` to the audit log with the changed field names.
The RPC returns one edit-detail row. The mobile `updateResident()` API may
continue returning its refreshed resident-list model after a successful RPC.

Remove or disable any fallback to `update_resident_with_birth_date` or other
full-row replacement. If `update_resident_fields` is missing, surface the
backend-update-pending error and do not save the resident.

## Guardian operations

- `create_guardian_link(p_resident_id, p_guardian_profile_id, p_relationship)`
  returns the new pending link UUID.
- `list_resident_guardian_links(p_resident_id)` returns pending and verified
  links to same-barangay officials, including account-active and email-confirmed
  flags.
- `review_guardian_link(p_link_id, p_decision, p_reason)` requires an active
  same-barangay official and records the decision in the audit log.
- Account invitation, verified email/phone, account activation, and guardian
  relationship verification are separate gates. A pending invitation grants no
  resident access. An inactive profile cannot access protected RPCs.

Do not verify a relationship merely because an invitation was sent. Verify
identity and relationship through the existing official review action.

## QR operations

- `get_resident_qr_card(p_resident_id)` returns active-card metadata only; it
  does not return a token or token hash.
- `issue-qr-card` is an authenticated function. It returns the QR URL for the
  just-issued card and explicitly replaces/revokes an earlier active card.
- `export-qr-card` is authenticated and re-exports the active card without
  rotating it. It returns `{ data: { cardId, publicUrl } }` with `no-store`.
  Legacy cards without ciphertext return `409 QR_EXPORT_UNAVAILABLE`; do not
  automatically issue a replacement.
- The current local secret name is `QR_CARD_ENCRYPTION_KEY_V1`, a Base64-encoded
  32-byte key. It is an Edge Function secret and must never enter client builds,
  source, logs, or support messages.

## Responder history and profiles

`list_resident_case_history(p_resident_id)` returns all cases to the resident's
same-barangay official, the resident account, and a verified guardian. A
responder receives only cases assigned to that responder profile. An unrelated
responder is rejected by resident ID and case ID lookups. Resident and case
authorization checks are role-specific, so completed assignments do not
preserve access if the profile later changes role.

Mobile call shape remains `rpc('list_resident_case_history',
{ p_resident_id: residentId })`. Remove the screen's assumption/comment that the
server returns the whole resident history and the client must filter it. The
RPC's returned row shape remains `case_id`, `status`, `outcome`, `created_at`,
`closed_at`, and `version`.

## Case and notification behavior

Keep case status, assignment status, independent guardian/responder
observations, report review, and official closure as separate concepts. Existing
reports support `reunited`, `assisted_independently`, `referred`, and
`transferred`. Closure remains an explicit official action with a documented
reason and recorded outcome; no automatic closure or forced reunification is
introduced. The existing `close_assistance_case(p_case_id, p_closure_reason,
p_expected_version)` action records `reviewed_by` and `reviewed_at` on the
selected responder report and writes a separate `case_report.reviewed` audit
event in the same transaction that closes the case and completes the assignment.

Push delivery requires hosted notification-worker scheduling and valid device
configuration. Do not claim Android push delivery until an installed Android
build receives a real test notification. Firebase/EAS setup is separate from
these database contracts.
