# Privacy, security and risk assessment (initial)

This is a preliminary technical assessment, not legal advice, a privacy impact assessment, ethics approval, or certification.

## Data categories

Account identity/contact/role, resident identity and support needs, guardian relationships, assistance cases, safety observations, optional location, QR tokens, device tokens and audit events. These may include sensitive personal information. Use fictional data until the responsible controller approves collection and controls.

## Risk posture

Primary risks are QR disclosure, unauthorized cross-guardian/cross-responder access, role escalation, false/duplicate requests, unsafe handover, inaccurate location, compromised credentials/devices, push leakage, integration outage and untested restore. Technical controls and test ideas are in `docs/security/THREAT_MODEL.md` and `ACCESS_CONTROL_MATRIX.md`.

The current legacy QR lookup was narrowed to return only QR/resident active state plus barangay name. The public scan result also omits the internal incident ID. The public API and both QR screens no longer include resident names or medical notes; backend tests check these allowlists. This source-level correction has not been deployed or checked against a hosted API. Legacy QR tokens are still stored raw in the legacy table until a reviewed cutover.

## Required safeguards before real data

- Identify controller/processor roles, lawful basis, notice/consent/disclosure and research approval.
- Minimize public fields; default to no medical details, home address, photo, guardian phone, government ID or history.
- Implement deny-by-default grants/RLS, privileged function validation, active-account checks and direct negative tests.
- Keep secrets server-side, enforce HTTPS, restrict Storage, redact logs and rotate exposed credentials.
- Approve guardian verification, safeguarding/refusal process, retention/deletion, breach response and support ownership.
- Verify backup/restore, notification fallback, device/session revocation and operational contact process.

The v3.0 report references Philippine privacy requirements; final legal interpretation and approvals belong to the responsible organization and privacy adviser.
