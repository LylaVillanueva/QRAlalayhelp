# Project charter and feasibility

## Purpose

QRAlalay is a QR-based community assistance and resident reunification system for one participating Philippine barangay. It helps a lost, disoriented or vulnerable person connect with authorized guardians through barangay coordination. It is not professional dispatch, medical diagnosis, guaranteed rescue, continuous tracking, or a replacement for 911.

## Initial scope

- One Android Expo application with official, guardian and responder role views.
- A public React/Vite QR website with no account or app installation requirement.
- Three independent pathways: QR-based assistance, direct barangay calling and direct 911 calling.
- Managed Supabase backend with PostgreSQL, Auth, RLS, protected functions, Realtime, scheduled work and notification outbox.
- Development with synthetic data until privacy, operational and research approvals exist.

## Constraints and feasibility

Four beginner student developers, one-barangay pilot, Android-first, limited budget. Existing screens, assets, workflows and uncommitted changes are valuable and must be preserved. The target is feasible only with P1 scope first, staged migration, early database authorization testing and a named operational owner. P2/P3 features must not delay core workflows.

## Exclusions

Professional emergency dispatch, ambulance dispatch, diagnosis, guaranteed response, always-on tracking, cross-barangay coordination, paid SMS fallback and broad offline editing are not initial scope.

## Success evidence

Verified role-scoped workflows, privacy-safe public QR responses, no duplicate cases under retry, no conflicting active assignments, independent observations, documented outcome and authorized closure, independent calling/help, direct negative authorization tests, Android/browser evaluation and truthful thesis evidence.

## Governance

The project team implements; adviser, participating barangay, university ethics/research authority, privacy personnel and service owners approve the policies and deployment conditions in `docs/OPEN_DECISIONS.md`. No production deployment or real personal data is authorized by this charter.
