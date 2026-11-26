# QRAlalay

QRAlalay is a community assistance and resident reunification project developed by the QRAlalay Student Research Team as an Undergraduate Capstone Project at the Technological University of the Philippines (TUP). Its study location is Barangay 206, Tondo, Manila, Philippines.

The system is a **Capstone System Prototype**, inspired by bayanihan and guided by the tagline “Teknolohiya na may malasakit.” The institution and study location describe the academic context; this project does not claim that TUP or Barangay 206 officially operates, endorses, or owns QRAlalay. The designated personal information controller remains subject to confirmation with the capstone adviser. QRAlalay is not an official emergency dispatch service or a substitute for professional emergency assistance.

Public support and privacy inquiries: [qralalayhelp@gmail.com](mailto:qralalayhelp@gmail.com) · [www.qralalay.app](https://www.qralalay.app)

QRAlalay is organized as a mobile application, public website, and Supabase backend. The independent Digital Bayanihan prototype is maintained separately.

## Repository layout

- `QRAlalay-Mobile/` — Expo Android/iOS application.
- `QRAlalay-Web/` — public website, currently served at https://www.qralalay.app.
- `QRAlalay-Backend/` — Supabase migrations, Edge Functions, and database tests.
- `docs/` — architecture, handoff, operations, and implementation notes.
- `.github/workflows/database-tests.yml` — isolated GitHub-hosted Supabase test workflow.

The mobile application and website use the hosted Supabase backend directly. The test workflow starts an isolated local Supabase stack on a GitHub-hosted Ubuntu runner and uses synthetic fixtures only; it has no hosted Supabase credentials.

See each project directory for its setup instructions. Never commit real `.env` files, keys, resident information, database backups, or signing credentials.
