# Legacy and recovery references

- `migrations/` and `tests/database/` preserve the earlier isolated-schema experiment. They are not part of the active migration chain and must not be applied to Project B.
- `express/` preserves the old Express README, environment template, deployment notes, and Express schema documentation. The Express source, migrations, tests, scripts, package, and recovery database remain at the repository root until Project B live workflow and recovery acceptance are complete.
- The active schema is under `supabase/migrations/`; the active ERD and API contracts are under `docs/`.

Do not delete recovery material or apply legacy SQL to Project B without an explicit review.
