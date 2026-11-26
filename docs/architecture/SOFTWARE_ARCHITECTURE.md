# Software architecture and design baseline

## Target

Feature-based client-server BaaS: Android React Native + Expo + TypeScript, Expo Router introduced in stages; public React/Vite/TypeScript site; Supabase PostgreSQL, Auth, RLS/explicit grants, database functions, Edge Functions, Realtime, Cron, private Storage, Expo Push/FCM and transactional outbox.

## Existing system to preserve during migration

Current mobile JS app uses React Navigation and a route registry; public website uses React/Vite; Express/TypeScript API is authoritative with PostgreSQL migrations, custom OTP/JWT, RBAC, audit, Socket.IO and timeout interval. Current flows and design tokens are documented in `docs/migration/CURRENT_SYSTEM_AUDIT.md` and `docs/design/UI_DESIGN_BASELINE.md`.

## Boundaries

Clients may use publishable Supabase credentials only after least-privilege grants/RLS are verified. Service-role/DB owner secrets remain server-side. Public Edge Functions validate QR tokens and return allowlisted fields. Protected mutations run transactional DB functions or validated Edge Functions. PostgreSQL remains the single authoritative data store. Realtime is an optimization; clients refresh canonical records after reconnect.

## Migration rule

No immediate Express deletion, dual-write or production database mutation. Introduce typed feature service boundaries; migrate function-by-function in an isolated local project; test parity; preserve the existing UI. Keep Express deployable through parity verification, then archive only after an approved cutover.

## Navigation decision

Expo Router is the target, but current app has React Navigation and deep links for `/scan/:token` and legacy `/resident/:residentId`. Maintain current navigation while stabilizing data/auth; prototype/introduce Expo Router in a separate staged slice. See ADR-002.
