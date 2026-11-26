# Open decisions and approval register

These decisions require the responsible team, adviser, barangay, privacy personnel or service owner. Code must not silently choose a policy.

| Decision | Why it matters | Suggested owner | Current state |
|---|---|---|---|
| Resolve Project B global default ACLs and confirm the authorized owner/admin path | Client roles currently inherit broad global default privileges for `postgres` and `supabase_admin`; foundation equivalence is incomplete. Do not repair migration history or deploy until reviewed and explicitly approved. | Supabase owner/DBA and project owner | Read-only catalog/role review complete. The available `postgres` connection cannot alter `supabase_admin` defaults. Project B remains untouched; it is identified by the CLI as production. |
| Confirm participating barangay and operational owner | Scope, account authority and ongoing maintenance | Team/adviser/barangay | Unconfirmed in supplied report |
| Approve Call Barangay number, hours, fallback wording | Avoid wrong or misleading contact details | Barangay | No verified target number identified |
| Confirm direct 911 wording/behavior | Immediate danger pathway must be independent and accurate | Adviser/barangay | Target requirement; copy pending review |
| Confirm whether email/password is usable by officials/guardians | Supabase Auth initial method and recovery | Barangay/team | Pending validation |
| Account provisioning and first official process | Privileged role security | Barangay/project owner | Pending approval |
| Privileged MFA requirement and enforcement | Protect official access | Project owner/adviser | Required before real resident data per target report |
| Verify guardian identity/relationship procedure | Prevent unauthorized ward access/handover | Barangay | Pending policy |
| Approve QR public disclosure fields | QR can be copied; sensitive information risk | Controller/privacy personnel | No approval evidence supplied |
| Approve retention, deletion, archive and audit periods | Legal and privacy obligations | Controller/privacy personnel | Pending |
| Approve safeguarding and refusal/escalation handling | Physical safety and resident autonomy | Barangay/adviser | Pending |
| Confirm push notification operation and fallback | Delivery is not guaranteed | Barangay/team | Provider operation unverified |
| Confirm production hosting/budget/backups | Reliability and recovery | Team/university/barangay | Pending |
| Confirm identity migration and existing QR compatibility | Avoid orphaned accounts or card replacement | Authorized data owner | Pending; no live DB inspection |
| Confirm Vite production API origin | Required for build/publish | API owner | Current local env points to localhost; no public origin approved |
| Confirm Android device/test matrix and thesis deadline | Acceptance scope | Team/adviser | Not supplied in source docs |
