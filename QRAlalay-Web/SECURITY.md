# QRAlalay bystander website: security overview

The bystander website is the page a stranger's phone opens after scanning a
resident's QRAlalay card. It's public by design: no login, because a bystander
in an emergency can't be asked to sign up. Security comes from controlling
what the page can reveal and do, not from who can open it.

## How a scan works

1. Each printed card holds one link: `https://<website>/scan/<token>`.
2. The website reads the token from the link and asks the QRAlalay backend for
   the resident's public details.
3. The bystander can send an alert, share their location once, call 911, or
   cancel a mistaken alert within 5 minutes.

The website stores nothing itself; every rule below is enforced by the
backend, so it holds even if someone bypasses the page.

## Threats and protections

| Risk | Protection | Where |
|---|---|---|
| **Guessing a card's link** to see someone's details | Each token is 24 bytes from a cryptographic random generator (192 bits). Guessing one is not realistically possible, and wrong guesses also hit the rate limit below. | `QRAlalay-Backend/src/utils/crypto.ts` |
| **A lost or stolen card** | Issuing a new card for a resident revokes the old one immediately; a revoked token returns "not active". | `QRAlalay-Backend/src/services/qr.service.ts` |
| **Revealing private data** | The public page gets only first name, barangay and medical notes. Never full name, address, ID number, phone numbers, photos or anything else. | `getPublicQrView` in `qr.service.ts` |
| **Flooding the system with fake alerts** | Public endpoints allow 30 requests per minute per IP address. Repeat scans for the same resident join the one open alert instead of creating new ones. | `QRAlalay-Backend/src/middlewares/rate-limit.ts`, `incident.service.ts` |
| **Someone cancelling another person's alert, or faking their location** | Cancelling and live location each need a separate secret code that the backend returns only to the phone that raised the alert. Cancel codes expire after 5 minutes and work only once. | `incident.service.ts` |
| **Eavesdropping on the connection** | HTTPS only: the website build refuses an `http://` backend address, the backend refuses to start in production with an `http://` website address, and HSTS tells browsers to never use plain HTTP. Phones also only share GPS over HTTPS. | `vite.config.js`, `QRAlalay-Backend/src/config/env.ts`, `vercel.json` |
| **Malicious code injected into the page (XSS)** | A Content-Security-Policy lets the page run only its own scripts and talk only to the QRAlalay backend. React escapes everything it displays. Fonts are bundled with the site, so no third-party code or font server is involved. | `vite.config.js` |
| **Another site embedding the page to trick users (clickjacking)** | `X-Frame-Options: DENY` and `frame-ancestors 'none'`: browsers refuse to show the page inside another site. | `vercel.json` |
| **The token leaking to other websites** | `Referrer-Policy: no-referrer`: the page's address (which contains the token) is never sent to other sites. | `index.html`, `vercel.json` |
| **Emergency pages showing up in Google** | `noindex` on every page and a `robots.txt` that disallows everything. | `index.html`, `public/robots.txt` |
| **Other websites calling the backend from a visitor's browser** | The backend's CORS rule only accepts browser requests from the QRAlalay website's own address. | `QRAlalay-Backend/src/app.ts` |
| **Unneeded phone features** | `Permissions-Policy` allows location (sent once with an alert) and blocks camera, microphone, payment and USB. | `vercel.json` |
| **Publishing a site that points at a developer's computer** | The production build stops with an error if the backend address is missing, `localhost`, or not HTTPS. | `vite.config.js` |

## Known limits

* **Anyone holding the card can open its page.** That's intended, since a
  stranger must be able to help. It's why the page shows so little.
* **The token appears in the hosting provider's access logs** because it's
  part of the address. Only the hosting account owner can see those logs.
* **A determined person could send a false alert** by scanning a real card.
  Every alert is reviewed by barangay staff, the guardian and responder must
  confirm, and the bystander's location and notes are recorded.
