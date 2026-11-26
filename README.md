# QRAlalayhelp

QRAlalay is the project name.

QRAlalay is organized as a mobile application, public website, and Supabase backend. The independent Digital Bayanihan prototype is maintained separately.

## Repository layout

- `QRAlalay-Mobile/` — Expo Android/iOS application.
- `QRAlalay-Web/` — public website, currently served at https://www.qralalay.app.
- `QRAlalay-Backend/` — Supabase migrations, Edge Functions, and database tests.
- `docs/` — architecture, handoff, operations, and implementation notes.
- `.github/workflows/database-tests.yml` — isolated GitHub-hosted Supabase test workflow.

The mobile application and website use the hosted Supabase backend directly. The test workflow starts an isolated local Supabase stack on a GitHub-hosted Ubuntu runner and uses synthetic fixtures only; it has no hosted Supabase credentials.

See each project directory for its setup instructions. Never commit real `.env` files, keys, resident information, database backups, or signing credentials.
