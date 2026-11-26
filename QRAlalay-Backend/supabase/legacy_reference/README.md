# Archived local migration approach

The files under this directory are preserved historical artifacts from the prior local-only migration attempt. They were removed from Supabase's active `migrations/` and `tests/database/` paths after the clean-database instruction on 2026-11-25.

They include a legacy schema baseline, a target migration that depended on legacy tables and backfilled legacy QR hashes, and pgTAP tests for that schema. **Do not apply these files to the new clean target project.** They may be consulted only for existing business-rule context or recovery of the previous local experiment. Keep the Express source and its original migrations as reference until replacement behavior has been verified.
