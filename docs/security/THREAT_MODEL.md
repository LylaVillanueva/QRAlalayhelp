# Initial threat model

Scope: QRAlalay mobile application, public QR website, Supabase/PostgreSQL target, push and location workflows. This is an engineering starting point, not a formal privacy impact assessment or security certification.

| Threat | Impact | Initial controls / verification |
|---|---|---|
| Copied QR URL exposes personal data | Resident privacy harm | Legacy public lookup now returns only active-card state and barangay name; name, medical-note, and internal incident-ID projection/rendering removed; API tests check both allowlists. Legacy raw-token storage remains during migration, and no hosted deployment or privacy review has verified the change. |
| Anonymous abuse/duplicate requests | False workload or denial of service | Durable rate controls, idempotency key, bounded payloads, duplicate handling; verify retries and request ownership |
| Cross-guardian/cross-responder reads | Sensitive resident/case disclosure | RLS, explicit grants, relationship and assignment checks inside DB functions; attempt forbidden direct API access |
| Privilege escalation/role tampering | Unauthorized administration | Role only in protected profile, official provisioning, MFA policy, no client metadata trust; negative tests |
| Stale session after deactivation | Continued access | Server-side active-account validation and session revocation; test unexpired token after disable |
| Compromised service credentials | Full database exposure | Server-side secret store, least privilege, rotation, secret scanning, no client bundling |
| Unsafe guardian handover | Physical harm | Approved safeguarding process, independent observations, resident autonomy, no automatic Safe/closure; human policy approval |
| Inaccurate or stale location | Misrouting or false confidence | Optional one-time location/manual description, source and timestamp, no continuous tracking by default |
| Push content leakage | Sensitive details exposed on lock screen | Generic payloads; authenticated fetch for details; token protection; receipts/retry without personal text |
| Notification/realtime outage | Missed notice | Durable case record and outbox; UI refresh/reconnect; delivery failure does not change case state |
| Lost device | Unauthorized access | Secure session storage, remote revoke, minimal local resident cache, reauth after recovery |
| Unlogged administrative action | Accountability gap | Append-only critical action audit; restricted read; retention approved |
| Backup or migration loss | Irrecoverable records | Synthetic migration rehearsal, tested restore, forward migrations and reconciliation checks |
| Malicious/invalid uploads | Storage abuse or code/content risk | Private bucket, image MIME/signature/size limits, image processing, short-lived signed URLs |

Unresolved ownership: controller/processor roles, lawful basis, consent/disclosure, retention, breach response, guardian verification, safeguarding referral, hotline coverage and operational support must be approved by the responsible barangay/university parties before real resident data is entered.
