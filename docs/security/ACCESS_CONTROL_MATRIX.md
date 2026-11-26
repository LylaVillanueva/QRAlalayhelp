# Target access-control matrix

All access is deny-by-default. This matrix is a design baseline and is not evidence that target policies have been implemented.

| Resource/action | Anonymous bystander | Official (own barangay) | Guardian (verified ward) | Responder (active assignment) | Resident account |
|---|---|---|---|---|---|
| Public QR lookup | Allow only approved minimal fields for active token | Authorized case view | Authorized linked case view | Assigned case minimum | No implicit public access |
| Full resident record | Deny | Read/write per official duties | Own verified ward fields only | Minimum fields required for active assignment | Own approved fields only |
| Guardian link | Deny | Verify/create/revoke with audit | Read own relationship; no self-verification | Deny | Read approved own relationship only |
| QR issue/revoke | Deny | Own barangay, server-validated | Deny | Deny | Deny |
| Assistance request | Create idempotently; own restricted status/cancel only | Read/manage own barangay | Read permitted linked case | Read assigned case | No implicit case access |
| Assignment | Deny | Assign/reassign own barangay | Read permitted status | Accept/decline own assignment; no arbitrary reassignment | Deny |
| Safety observation/report | Deny | Review; no impersonation | Own verified ward observation | Own accepted assignment only | Only if approved requirement |
| Close/reopen case | Deny | Authorized review with reason/outcome | Deny | Submit report; cannot close | Deny |
| Contact information | Read approved public hotline only | Maintain verified own barangay contact with audit | Read approved contacts | Read approved contacts | Read approved contacts |
| Audit | Deny | Restricted own-barangay permitted fields | Deny | Deny | Deny |
| Push/device token | Deny | Own device; admin cannot read raw token | Own device | Own device | Own device |
| Storage photos | Deny | Signed URL for authorized view/update own barangay | Authorized linked ward | Only if assignment requires it | Own approved image |

Enforcement must exist in database grants/RLS and protected functions, not just client navigation. Validate active status and scope inside privileged functions; do not trust client role metadata. Avoid broad selects: sensitive columns need restricted views/functions. Realtime and Storage policies must match the same row scopes.
