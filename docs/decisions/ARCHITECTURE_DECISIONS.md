# Architecture decision records

## ADR-001 — Supabase BaaS is the target backend; migration is staged

- **Decision:** Use Supabase Auth, PostgreSQL/RLS, database functions, Edge Functions, Realtime, Cron and Storage as the target. Keep Express/Socket.IO running during migration and retire only after feature, security and data parity is verified.
- **Problem:** Current Express code has valuable workflow and authorization logic, but final target requires a managed Supabase backend suitable for a four-person beginner team and one-barangay scope.
- **Alternatives:** Keep Express as permanent authority; replace immediately; adopt Firebase; introduce microservices.
- **Advantages:** Less custom infrastructure; relational constraints and transactions; matches target report and existing PostgreSQL schema.
- **Disadvantages:** RLS and function authorization are complex; provider dependency; migration and learning cost.
- **Rationale:** Incremental BaaS migration reduces operational burden without discarding tested business rules.
- **Cost/time:** Free/local development is feasible; production quotas, backups and reliability require a budget decision. Migration is multi-phase and not a one-step rewrite.
- **Security/safety:** No client connection to confidential tables until grants, RLS, functions and direct negative tests pass. No dual-write or production migration in this phase.
- **Consequences/verification:** Build parity matrix, forward migrations, isolated Supabase tests, restore rehearsal, then a separately approved cutover.

## ADR-002 — Preserve React Navigation during stabilization; adopt Expo Router incrementally

- **Decision:** Keep current role route registry/native-stack behavior while establishing TypeScript and service boundaries. Evaluate Expo Router with a compatibility prototype; adopt in stages only when existing deep links (`/scan/:token`, legacy `/resident/:residentId`), role gating and route params remain verified.
- **Alternatives:** Immediate full rewrite; permanent React Navigation deviation.
- **Rationale:** Target requires Expo Router but explicitly warns against a large rewrite before stability. Current screens depend on React Navigation route params and the app has uncommitted folder moves.
- **Security:** Navigation is not authorization; server-side controls remain required.
- **Verification:** Route inventory, deep-link tests, role access tests and visual regression before removing old navigator.

## ADR-003 — Preserve existing QRAlalay visual identity

- **Decision:** Keep source tokens, fonts, assets, layouts and role-specific UI as baseline. Reuse shared components for new Help/contact features.
- **Alternative:** Apply report's conceptual teal/blue visual proposal.
- **Rationale:** Explicit preservation instruction outranks conceptual wireframes. Design token values are recorded in `docs/design/UI_DESIGN_BASELINE.md`.
- **Verification:** Screenshot comparison required when simulator/device is available.

## ADR-004 — No production data or external deployment during migration work

- **Decision:** Use synthetic fixtures and isolated local/staging resources only. No production writes, paid resources, publishing, or real emergency calls.
- **Rationale:** Target report requires privacy, safety and operational approvals not yet present in workspace.
- **Verification:** Environment separation and negative tests; record external approvals in `docs/OPEN_DECISIONS.md`.
