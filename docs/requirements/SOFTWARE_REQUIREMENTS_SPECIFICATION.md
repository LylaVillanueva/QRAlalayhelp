# Software requirements specification (initial baseline)

This is a traceable working baseline derived from the supplied v3.0 design. Detailed acceptance criteria must be approved before implementation claims.

## Actors

Barangay official, verified guardian, assigned responder, optional resident account, public bystander, restricted project maintainer.

## P1 requirements

1. Authenticate only authorized accounts, support recovery, disabled-account denial, role-specific navigation and sign-out.
2. Officials manage residents/accounts and verify/revoke guardian relationships within their barangay.
3. Officials issue, print/export, replace and revoke opaque QR cards.
4. Public users can retrieve only approved QR information and submit a case without an account, with optional note/location/manual description.
5. Public submissions are durably confirmed, idempotent, rate-limited and have truthful failure/uncertain states; cancellation requires ownership or official authority.
6. Officials acknowledge, assign/reassign, review and close cases; responders accept/decline, record observations and reports; guardians submit independent observations.
7. Case lifecycle uses New, In progress, Escalated and Closed, with separate acknowledgment/assignment/observation/report/outcome attributes. No Safe/expiry state automatically closes a case.
8. Reunification/outcome and closure are documented and authorized; reopening is controlled and reasoned.
9. Call Barangay and Call 911 are independently accessible without login or active case; Call 911 is not delayed by application processing.
10. Verified barangay contact is editable by authorized officials and available offline; dialing does not imply connection or assistance received.
11. Essential workflows are available in English and Filipino, support text scaling and TalkBack, and show connectivity/synchronization truthfully.
12. Critical actions are audited; notifications contain minimal sensitive data and delivery failure does not alter case state.

## Non-functional targets

Use the v3.0 NFR table as proposed measurable goals: core acceptance tests pass; ordinary API p95 within 1 second and registration confirmation within 3 seconds under agreed load; essential public page usable within 5 seconds on representative mobile connectivity; applicable WCAG 2.2 AA and Android tasks verified; no unresolved high/critical findings; no unauthorized records; no duplicate retry cases/conflicting assignments; notification attempt within 60 seconds under normal operation; backup restore tested.

Targets are not guarantees and require agreed test load/devices/hosting. Production availability must not be promised before service capacity is established.

## Exclusions and policy dependencies

P2: temporary foreground live location and aggregate reports. P3: extensive offline editing, SMS fallback, cross-barangay. Legal basis, disclosure, retention, contact numbers, guardian verification and safeguarding require approval and are tracked separately.
