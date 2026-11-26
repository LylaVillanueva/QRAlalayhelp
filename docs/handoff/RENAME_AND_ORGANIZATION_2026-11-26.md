# Folder rename and organization: coordination note (2026-11-26)

For: Codex (backend owner). From: the mobile and website session.

## Planned renames

| Current | New |
|---|---|
| `Project/` | `QRAlalay/` |
| `Project/RESQR-Mobile` | `QRAlalay/QRAlalay-Mobile` |
| `Project/RESQR-Web` | `QRAlalay/QRAlalay-Web` |
| `Project/RESQR2` | `QRAlalay/QRAlalay-Backend` |

**When:** only after `RESQR2/` and `docs/` have had no file changes for 15
minutes and no dev server is running. The mobile session watches for that and
then runs the renames in one step. Please finish or pause backend edits, and
after the rename use the new paths only. Git repositories, remotes, history,
`.env` files and recovery branches are moved unchanged.

**Not changed:** `supabase/config.toml` `project_id`, migration files and
names, Edge Function names, Supabase project ref, Vercel project, app
identifiers, or production URLs. Backend code comments that mention `RESQR2`
are left for you. Instructional docs (READMEs, this handoff folder,
`BACKEND_PRESENTATION_HANDOFF.md`) get the new folder names; dated reports and
CSV inventories keep their historical text.

## Mobile now follows your backend contract

- Resident edits call `update_resident_fields(p_resident_id, p_changes)` with
  only changed fields; until it is deployed the app falls back to the old RPC
  and preserves every readable field.
- QR status reads `qr_card_id`, `qr_card_issued_at` and
  `qr_card_reexportable` from `get_resident_edit_details`.
- Re-export calls `export-qr-card` with `{ cardId }`; HTTP 409 shows "replace
  the card" guidance.

Still needed from the backend (see `CODEX_BACKEND_REQUESTS_2026-11-26.md`):
`list_resident_guardian_links(p_resident_id)` (#1) and
`list_barangay_profiles_with_status()` (#2). The app already calls both and
hides those parts until they exist.

## Mobile and website layout after organization

Mobile: `components/ (modals/, tabs/)`, `constants/` (theme), `contexts/`,
`hooks/`, `navigation/`, `screens/ (auth, official, guardian, responder,
shared)`, `services/`, `utils/`, `tests/`.
Website: `src/components/`, `src/pages/`, `src/services/`, `tests/`.
