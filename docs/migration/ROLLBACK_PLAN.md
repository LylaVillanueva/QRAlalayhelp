# Migration rollback and recovery plan

This plan is for isolated development/staging until deployment authority and backups are approved. No production changes are authorized by this document.

## Source recovery

- Pre-migration source snapshot: `/private/tmp/qralalay-mobile-pre-migration.tar.gz` (excludes secrets, dependencies, Git metadata and device metadata).
- Mobile repository history remains untouched; do not reset, clean, stash automatically, force-push, or overwrite local changes.
- Before each migration phase, record Git status and create a new source-only snapshot when changes are substantial.
- `QRAlalay-Backend/` is not an independent Git repository in this workspace. Establish its repository boundary before commit operations; never commit through the parent home-directory Git repository.

## Database recovery strategy

1. Develop with synthetic data in a local Supabase project.
2. Apply only new forward migrations; preserve every existing migration file and checksum.
3. For a failed local migration, discard/recreate only the disposable local project. Do not use destructive reset commands against a remote reference.
4. For staging, restore a tested backup or apply an explicit forward-fix. Keep migration and data verification logs.
5. Before any future approved production cutover, require a verified backup, a successful restore rehearsal, an owner-approved maintenance window, and a per-migration rollback/forward-repair procedure.
6. Dual-write is prohibited. Cutover must have one authoritative writer; freeze writes or use an explicitly tested synchronization method.

## Application rollback

- Keep the Express API and Socket.IO deployment configuration available during parity testing.
- Do not retire them until the new system passes feature parity, authorization, migration-integrity and regression gates.
- At cutover, retain a versioned deployable artifact and configuration rollback procedure. Never roll back by restoring stale data over newer data.
- Revoke exposed secrets through their provider; deleting them from files is insufficient.

## Stop conditions

Stop and do not proceed if RLS/privilege tests disclose unrelated resident data, migration checksums diverge, QR link compatibility is unproven, backups cannot be restored, or source changes cannot be recovered.
