# QRAlalay live workflow test on Android (Expo Go)

Mobile build: branch `checkpoint/functional-simplification-2026-11-26` (commit `ac2cc98` or later).

**Run the full workflow only after Codex confirms that migrations `20261126002457`, `20261126010000`, `20261126011000`, `issue-qr-card` and `export-qr-card` are deployed.** Guardian verification now depends on that deploy: registration creates a *pending* relationship, and an official verifies it separately with a reason.
Backend: Supabase Project B (`jmzpqfgbjigbxkuofaae`). Fill in **Result** as you go; a step passes only if it matches **Expected**.

## Rules
- Use only the existing demonstration accounts and fictional residents (for example "Test Resident Uno").
- **Never complete a real call.** When a Call Barangay or Call 911 confirmation appears, tap **Cancel**.
- Create no new hosted accounts without approval. Inviting a new guardian sends a real invitation email and creates an account, so step 3b needs approval first.

## Setup (once)
1. The Samsung has **Expo Go for SDK 57** (the Play Store version is SDK 58 and won't open this project). The phone and the Mac are on the same Wi-Fi.
2. On the Mac:
   ```
   cd "QRAlalay/QRAlalay-Mobile"
   npx expo start --lan
   ```
   If the phone can't connect, stop it and run `npx expo start --tunnel`.
3. In Expo Go, scan the QR code shown in the terminal. The QRAlalay start screen should appear.
4. Have the email inboxes for the **official**, **guardian** and **responder** demo accounts open on the Mac. Each sign-in sends a 6-digit code.
5. One phone means switching accounts: **Settings → Log Out**, then sign in as the next role.

## What Expo Go cannot test
- Push notifications (Android Expo Go has no remote push).
- The final app name, icon and release behaviour.

These are re-checked on the installed APK.

## A. Works on the current backend

| # | Role | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | — | Start screen → **Emergency help** → tap Call 911 → **Cancel** | Confirmation appears; nothing is dialled | |
| 2 | Official | Log In → official email → **Continue** → enter code → **Verify** | First time: Privacy and Data screen (no permission demands) → Agree → Home | |
| 2a | — | Log In with a wrong 6-digit code | "Verification Failed"; you stay signed out | |
| 2b | — | Log In with an unregistered email | Same "Check your email" message (no account disclosure); no code arrives | |
| 3a | Official | Residents → **Register Resident** → fictional resident → Next → **Existing guardian** (demo guardian) → relationship → **Register** | QR card screen shows a QR and "Guardian relationship: pending verification" | |
| 4 | Official | On that screen → **Save / Share QR Card** | Share sheet opens with a PDF showing only the QRAlalay title, the QR and short text (no name or address) | |
| 5 | Official | **View Resident Profile** → Pending Guardian Relationships → **Verify** → type how identity was checked → Verify Relationship | Guardian section shows the guardian with a **Verified** pill *(needs deploy)* | |
| 6 | Guardian | Before step 5: sign in as the guardian → **My Residents**. After step 5: repeat | Before: the resident is **not** listed. After: listed, with **no** "Safe" badge | |
| 7 | Anyone | Scan the QR from the PDF (shown on the Mac screen) with the **in-app scanner** (centre tab button) | "Help a resident" screen, "Valid resident card", Barangay name | |
| 8 | Anyone | Enter a landmark and a note → **Request Assistance** → allow location once | "Your assistance request was sent to the barangay"; **Check request status** shows *New Request* | |
| 9 | Official | Sign in as the official → Home | The request appears under Needs Attention as **New Request**; tapping it opens **Assistance Details** (not assignment) | |
| 10 | Official | Assistance Details → **Assign Responder** → choose the demo responder → **Assign** | Pop-up "Responder assigned", then back on the case with the responder named | |
| 11 | Responder | Sign in as the responder → Home | **Accept** / **Decline** shown; no Report Safe or report buttons yet | |
| 12 | Responder | **Accept** | Report Safe, Report Not Safe, Can't Reach Location, Document Guardian Contact Attempt and **Submit Assistance Report** appear | |
| 13 | Responder | **Document Guardian Contact Attempt** → reason → Save | Case shows "Latest contact attempt: …" | |
| 14 | Responder | **Report Safe** → Report Safe | Pop-up "Safe observation recorded"; Responder shows **Safe** | |
| 15 | Responder | **Submit Assistance Report** → choose reason, actions, condition, outcome (handover details if asked) → Submit | Pop-up "Assistance report submitted"; the case shows it | |
| 16 | Official | Assistance Details | **Review & Close** stays **disabled** (the guardian hasn't reported Safe) | |
| 17 | Guardian | Sign in as the guardian → Home → Active Assistance → **Report Safe** → Report Safe | Guardian shows **Safe** | |
| 18 | Official | Assistance Details → **Review & Close** → reason | Case becomes **Closed** | |
| 19 | All | Official: resident profile → Assistance History. Guardian: Assistance tab (filter Closed). Responder: History tab | The closed case appears for each role | |
| 20 | Official | Settings → Activity Log | Entries for registration, assignment, observations, report and closure, each with actor and resident | |

### Error and permission checks
| # | Steps | Expected | Result |
|---|---|---|---|
| E1 | Responder: on a new assignment tap **Decline** with an empty reason | Button disabled until a reason of at least 3 characters | |
| E2 | Official: on an assigned case → **Reassign Responder** → choose another → Reassign | A reason is required; the case moves to the new responder | |
| E3 | Official: resident profile → **Revoke QR Card**, then scan the old card | "This QR code is not available." | |
| E4 | Turn on airplane mode in the app → wait or pull back to the app | A red "Could not refresh… Tap to retry" bar; the old data stays visible | |
| E5 | Tap **Request Assistance** twice quickly | Only one request is sent | |
| E6 | Official: Resident profile → Edit Information → Save | **Before Codex deploy:** "needs a backend update… No information was changed." After the deploy: saved | |
| E7 | Guardian: open a resident you are not linked to (if a link exists) | Not visible | |

## B. Wait for Codex's backend deploy (then re-test)
| # | Steps | Expected after deploy | Result |
|---|---|---|---|
| B1 | Official: Resident profile → **View QR Card** on a card issued after the deploy | The same card is shown again without replacing it; Save / Share works | |
| B2 | Resident profile → **View QR Card** on a card issued *before* the deploy | "Can't be shown again… The printed card still works"; **Keep Current Card** is the default; the card is not replaced | |
| B3 | Edit resident name or date of birth → Save | Saved; other fields unchanged | |
| B4 | Responder: open a resident's information from a case | History lists only that responder's own cases (backend item D) | |
| 3b | *(needs approval: creates a real account)* Register Resident → **New guardian** with an inbox you control → open the invitation email → official activates the account → guardian signs in | The guardian sees the resident | |

## After testing
Send the filled-in Result columns, or screenshots of any failure, to the mobile session.
