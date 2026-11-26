# Software test and evaluation plan

## Layers

- Unit tests for mappings, transitions, validators and notification payloads.
- Database tests (pgTAP or equivalent) for constraints, functions, RLS, grants, concurrency and audit behavior.
- Edge/API tests for public allowlists, auth, idempotency, rate control and failure semantics.
- React Native Testing Library/Jest for roles, Help, form errors, scaling and navigation.
- Playwright for public QR states, submission and cancellation.
- Android development build tests for camera, dialer, location denial/grant, push, SecureStore, TalkBack and network recovery.
- Visual screenshot comparisons with synthetic data.
- Performance and backup/restore tests under agreed environments.

## Baseline

See `docs/testing/TEST_RESULTS.md`. Three mobile failures and one API test isolation failure existed at baseline; the public production build is intentionally blocked by localhost config. No target migration pass is claimed.

## Safety constraints

Use synthetic data, isolated Supabase and controlled phone numbers. Do not execute a completed 911 call. Do not run migration/reset against a production endpoint. Tests must attempt forbidden direct data access, not merely inspect hidden UI controls.
