# QRAlalay application-flow review

Reviewed 8 October 2026 against the current application screens, backend policies, database migrations, and existing tests. No separate thesis specification or diagrams were supplied for this review. This is a consistency review and repair, not certification of production readiness or regulatory compliance.

## Coverage

- Parsed all 83 JavaScript/JSX files found in the mobile project and public website source, excluding dependencies, generated output, and assets. Checked unbound identifiers and relative imports; the final scan found zero issues in those categories.
- Type-checked the backend TypeScript project. Manually traced authentication, account and resident access, QR issuance/scanning, assignments, confirmations, reports, cancellation, escalation, notifications, and socket audiences.
- Reviewed the schema/migration definitions relevant to these flows. No live database migrations or record changes were performed.
- Built the public React website and exported the Expo app for Android, iOS, and web.
- The separate root `app/` Android project is a starter application displaying “Hello Android.” It is not the QRAlalay Expo application and was not converted or built as part of this review.
- Existing mobile folder reorganization and deleted legacy `src/` paths were preserved.
- Read the required [Expo 57 documentation](https://docs.expo.dev/versions/v57.0.0/) before editing code.

## Repairs made

| Area | Problem | Result |
| --- | --- | --- |
| Add User | Name and phone fields referenced an undefined updater; submitted name did not match the displayed fields | First/last names now form the account name; input handlers work; Philippine mobile numbers receive the displayed +63 prefix |
| Guardian alerts | Filter buttons changed route parameters while filtering read a separate unchanged state | Filters now read the selected route parameter |
| Guardian home | Wrong role label and My Wards link opened audit history | Correct Guardian label and resident-list destination |
| Guardian profile | Undefined component references | Removed/corrected those references |
| Official review | No-guardian Safe confirmations/reports could move incidents into the Closed filter before official approval | No-guardian and marked-unreachable-guardian incidents remain active for review; current assigned responder report and Safe confirmation are required for official closure |
| Automatic guardian timeout | Auto-marking unreachable set `confirmed_safe` prematurely | The incident retains its active/escalated state and officials are told a report is required |
| Cancellation lifecycle | Cancelled incidents could accept some later actions | Confirmation, reporting, assignment, and closure reject cancelled incidents |
| Responder reassignment | Official detail page had no reassignment action; old access problem persisted | Active assignments can be replaced; new assignment clears previous responder access-problem and reminder fields, report eligibility, and summary |
| Unassigned list | Escalated or partially confirmed unassigned incidents were omitted | Unassigned counts/filter use missing responder assignment and active status |
| Reports | Closed incidents still presented an enabled submission form | Report submission is disabled for terminal incidents and unassigned viewers |
| Review labels | Cancelled/resolved records could be labelled Approved | Approval label requires explicit backend `closed` status |
| Public cancellation feedback | Website announced cancellation when backend returned `cancelled: false` | Success requires a true result; otherwise the user is told cancellation is unavailable |
| Public cancellation credentials | Duplicate scanners and normal incident responses could expose the original cancellation token | Duplicate scans, authenticated incident responses, and socket events omit that credential |
| QR concurrency | Concurrent initial scans/issuances lacked a shared resident lock | Added resident row locks in QR scan/issuance transactions; real database concurrency still needs integration testing |
| Mobile/public parity | In-app public QR page omitted medical notes and cancellation | Both landing pages expose the permitted notes and offer eligible cancellation |
| Live events | Updates were broadcast to every socket account | Events target only the resident’s barangay staff room and guardian room; assignment also targets the responder |
| QR revocation | An official could target a QR outside their barangay | Revocation write is constrained to the official’s barangay and role |
| Authentication | Identifier-only login bypassed verification; public verification accepted account role provisioning | Removed identifier-only login and public self-signup; accounts must already exist |
| Browser access | Separate public-site origin was not accepted by CORS | Configured public-site origin is accepted alongside dashboard origin |
| Push preferences | Reopening the app could re-register despite the saved master toggle | Registration checks the saved master preference; logout attempts device unregister |
| Privacy copy | Claimed medical notes were hidden and email codes/photo storage were active | Descriptions reflect the current public response and demonstration authentication |
| Dependencies | Declared dropdown dependency was not installed | Installed the declared missing dropdown and lodash packages with lifecycle scripts disabled |

## Workflow to use for the defense

1. An official provisions accounts and enrolls residents. A resident can have one linked guardian; a guardian can have multiple wards.
2. The official issues a token-based QR link. Reissuing replaces the previous active card.
3. A bystander opens the QR landing page, sees the permitted emergency information, and explicitly submits an alert. Opening the page alone does not create an incident.
4. The alert includes available submitting-device coordinates and notes. Missing coordinates do not prevent submission.
5. The backend records the incident and attempts guardian/official push notifications. An official manually assigns a responder.
6. Guardian and assigned responder submit independent safety decisions. Either current Not Safe decision blocks safety confirmation/closure.
7. With an ordinary reachable guardian, both Safe confirmations permit `confirmed_safe`; the report endpoint can then resolve the incident. Mobile groups `confirmed_safe`, `resolved`, and `closed` under Closed. These are not identical database events.
8. Without a guardian, or after a guardian is explicitly/automatically marked unreachable, the incident stays active. The assigned responder must confirm Safe and submit a report; an official reviews and closes it. A guardian Not Safe decision still blocks closure.
9. A responder who cannot reach the site records a reason. Officials decide whether to reassign. The feature does not automatically dispatch another unit.
10. The backend periodically reminds/escalates qualifying incidents. Timer defaults are 10 minutes to escalation and a further 45-minute guardian grace period; configuration can override them.
11. The original public alert session may cancel only within the allowed window while the incident remains `active`. Cancellation does not retract notifications already sent.

## Validation evidence

| Check | Result |
| --- | --- |
| Backend tests | 32 passed; the initial run had two failing lifecycle assertions and their parent test |
| Mobile tests | 13 passed |
| Backend TypeScript check | Passed |
| Public website production build | Passed |
| Expo Android export | Passed |
| Expo iOS export | Passed |
| Expo web export | Passed |
| JavaScript syntax, unbound identifier, relative-import scan | 83 files, zero remaining detected issues |
| Expo dependency check | Offline check reported up to date; Expo warns that offline validation is less reliable |

The backend regression tests use mocked database access. Passing them does not prove actual SQL execution, migration state, transaction behavior, concurrency, or external delivery. Exports prove bundling, not successful installation or operation on physical devices.

## Remaining requirements and limitations

- **Authentication is still a demonstration flow.** `123456` remains the fixed code; no email/SMS ownership verification occurs. Do not deploy this as production authentication. The unused provider code does not make the active login flow real OTP delivery.
- **Formal requirements remain unverified.** Supply the approved thesis/use-case/DFD requirements to evaluate exact compliance. This report uses existing code, screens, and tests as the reference.
- **Live database verification remains necessary.** Existing migrations must be applied to a suitable test database. Previously prematurely resolved records were not reopened or rewritten.
- **Hardware and delivery require a real test.** Test camera, location permission denied/granted, map opening, dialer links, push registration, background notifications, network failure, and multi-device refresh on a configured native build.
- **Push delivery is best-effort.** Receipt processing/retries and server-enforced per-category notification preferences remain incomplete. The master toggle is handled, but category and sound toggles are not a demonstrated server-side delivery policy.
- **Responder reading scope needs an explicit product decision.** Resident lists are assignment-filtered, while some incident/profile APIs and socket rooms permit same-barangay staff access. This review preserves that existing staff scope; it does not claim all responder reads are assignment-only.
- **Transactions and session hardening need further work.** Some legacy enrollment/audit/notification operations are not committed atomically together. Refresh rotation overwrites the previous active row, so old-token replay is not always the all-session reuse detection described by older documentation. Logout revokes refresh access but does not immediately invalidate an already issued access JWT.
- **Enrollment needs database-level concurrency tests.** Readable resident IDs use a count-based sequence. Simultaneous enrollments and interrupted multi-step guardian/resident creation need verification and hardening.
- **Guardian assignment validation is uneven.** Newer account-management flows validate ward jurisdiction transactionally; legacy enrollment/guardian-link paths need equivalent checks before claiming uniform enforcement.
- **Not Safe visibility and notification are different.** The incident status updates, but the existing confirmation service only sends discrepancy-specific pushes. Do not promise a new official push for every Not Safe confirmation.
- **There is no continuous tracking or offline synchronization.** Location is a submitted snapshot. The mobile location lookup still needs real-device timeout testing. Shared app data refreshes periodically while active.
- **QR download/print, photo upload, full translation, and completed legal content remain incomplete.** Existing UI placeholders are not completed integrations. The privacy policy still needs organization/contact details and independent review.
- **Public information is sensitive.** Anyone holding the active QR link can retrieve first name, medical notes, and emergency contacts. It is a limited public view, not anonymized data.
- **The public website is a bystander interface.** Do not describe it as a completed web dispatcher dashboard.

## Device demonstration checklist

Use test accounts and fictional residents. Verify enrollment, QR replacement, public alert with/without coordinates, duplicate scan, eligible/rejected cancellation, assignment, reassignment, both Safe, either Not Safe, unreachable guardian, unreachable location, report submission, official review, and history. Confirm cross-barangay requests fail where required. Do not place real emergency calls during a demonstration.

No deployment, external messages, or live database mutations were performed for this review.
