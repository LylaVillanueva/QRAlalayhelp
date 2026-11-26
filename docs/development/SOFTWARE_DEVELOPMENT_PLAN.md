# Software development plan

## Working approach

Incremental and iterative, with small reviewable changes and synthetic data. The 9 execution phases are tracked in `docs/IMPLEMENTATION_PROGRESS.md` and specified in the migration instructions. Complete P1 before P2/P3.

## Team roles (proposed)

1. Mobile/UI and accessibility.
2. Database/RLS and migration.
3. Supabase functions/auth/notifications.
4. Public web, integration and test coordination.

Roles are proposals; the team must assign named owners. Each change receives peer review and updates traceability/tests/docs.

## Branch and recovery rules

- Preserve existing mobile uncommitted changes and three upstream commits; do not reset/clean/auto-stash.
- Keep credentials out of commits and checkpoints.
- Establish a safe Git repository for `QRAlalay-Backend` before committing it; current Git lookup escapes the workspace.
- One authoritative writer per environment; no dual-write.
- Use forward migrations and synthetic fixtures; production cutover requires separate approval.

## Local workflow

Use current lockfiles, Node versions declared by each package, and the exact Expo 57 documentation. Do not upgrade dependencies blindly. Run package-specific checks; record exact failures and environment blockers. Avoid physical emergency calls; use a controlled number or stop at the dialer.
