# QRAlalay Website

The QRAlalay Website is the public emergency response website for the QRAlalay system. A
resident's QR card links to a scan page. When a bystander scans the card, the
website retrieves the resident's limited emergency profile and provides a
quick way to notify the barangay and guardian.

The website is designed for use during an emergency: it does not require an
account, works from a phone browser, and keeps the alert flow short. A bystander
can add an optional note, share their location once with the alert, call the listed emergency
number, and cancel an alert sent by mistake while cancellation is available.
The page can still send an alert when location access is unavailable or denied.

Resident information and alerts are handled by the QRAlalay Supabase backend (public Edge Functions). The website
shows only the public emergency details returned for that QR card, such as the
barangay and its confirmed contact numbers. It is a React website built
with Vite and deployed as a static site; it is not an Expo or React Native app.

## Website flow

1. A bystander scans a resident's QR card and opens its `/scan/<token>` link.
2. The website requests the public emergency details from the backend.
3. The bystander can call for help or submit an alert with optional notes and
   location.
4. The backend attempts to notify the configured guardian and barangay
   responders. If the alert was accidental, the bystander can cancel it during
   the available cancellation period.

The website is the public, bystander-facing part of QRAlalay. It does not provide
resident registration, profile management, or officer accounts.

## Run it on your computer

1. Install Node.js and npm if they are not already installed.
2. Open a terminal in this folder (the repository root).
3. Install the packages listed in `package-lock.json`:

   ```sh
   npm install
   ```

4. Copy `.env.example` to `.env.local` and set the Project B Supabase URL and
   publishable key. The scan service calls the public Edge Functions. Do not
   put a service-role key in a Vite variable; Vite embeds these values in
   browser files.


5. Start the website:

   ```sh
   npm run dev
   ```

Vite prints the local address to open in a browser. Open a scan link in the
form `/scan/<token>` (the app shows it when you issue a QR card). Any other
address shows a short "Scan a QRAlalay card" notice; there's no way to type in a
code.

`npm run build` creates the production website in `dist/`. It requires both
Supabase variables and allows only the configured Project B origin in the Content Security Policy.

`npm test` runs the public QR API contract tests with mocked Edge Function
responses; it does not contact a backend.

## Deploy it to Vercel

This repository (`QRAlalay_Website`) is the website by itself, so Vercel's
**Root Directory** stays at the repository root.

1. In Vercel, choose **Add New → Project** and import
   `LylaVillanueva/QRAlalay_Website`. Framework preset: **Vite** (also set in
   `vercel.json`). Build command `npm run build`, output directory `dist`.
   The build runs on Node.js 24 (`engines` in `package.json`).
2. In **Settings → Environment Variables**, add both of these for
   Production and Preview:
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable key
   These values are public (Vite puts them in browser files). Never use a
   secret or service-role key here; the build refuses one.
3. Deploy. The build fails on purpose if either variable is missing or the
   URL is not an HTTPS `*.supabase.co` origin.
4. In the Supabase project, set the Edge Function secrets
   `PUBLIC_WEB_ORIGINS` (comma-separated exact origins, no trailing slash) and
   `PUBLIC_SITE_ORIGIN` (the origin printed in QR links) to the final website
   origin, such as `https://qralalay-website.vercel.app`. Without this, browsers block
   the website's requests.
5. Issue or reissue residents' QR cards after the final domain is set. Each
   QR link embeds the website address.

Direct links such as `/scan/<token>` are routed to the React app by the
rewrite in `vercel.json`, so scanning a QR code or refreshing that page works.
Security headers are also set in `vercel.json`; see `SECURITY.md`.

## What happens when someone scans a QR code

1. `index.html` provides the empty page element that React will fill in.
2. `src/main.jsx` starts React and loads the app's CSS.
3. `src/App.jsx` checks the browser's current URL. `/scan/<token>` opens the
   emergency screen; any other URL shows a short notice with a 911 button.
4. `src/pages/ScanPage.jsx` asks the backend for the QR code's public resident
   information: first name, barangay and medical notes.
5. When the bystander raises an alert, `src/services/geolocation.js` tries to get the
   device's location. Location is optional: denying permission does not stop
   the alert.
6. `src/services/api.js` sends the scan and any optional note/location to the backend.
   The screen then shows the result, offers a direct phone call, and displays a
   short cancellation option if the backend returned a cancellation token.

## Folder guide

- `src/App.jsx` — chooses which screen to show from the URL.
- `src/components/PageLayout.jsx` — the logo and divider shared by every screen.
- `src/pages/ScanPage.jsx` — public resident details, alert submission, result, and
  cancellation screens.
- `src/services/api.js` — backend HTTP requests and error handling.
- `src/services/geolocation.js` — best-effort browser location lookup.
- `src/index.css` — page layout, colors, buttons, and form styles.
- `src/main.jsx` — starts the React app.
- `index.html` — the browser page that loads the React app.
- `vite.config.js` — dev server settings, production build checks and the
  Content-Security-Policy.
- `vercel.json`, `public/robots.txt` — Vercel security headers, QR link routing
  and search-engine blocking.
- `SECURITY.md` — what is protected and how.
- `package.json` — project commands and direct dependencies.
- `package-lock.json` — exact dependency versions for repeatable installs.
- `.env` — this computer's Supabase URL and publishable key; it is intentionally excluded from Git.

`node_modules/` is downloaded by `npm install`, and `dist/` is generated by
`npm run build`. Neither folder is needed to understand or keep the source
code. The old `.expo` cache and the unused React Native prototype have also
been removed because this project runs in a browser with Vite.

## A few plain-language terms

- **React component:** a JavaScript function that describes one part of the
  page. `App` and `ScanPage` are components.
- **State:** information that can change while the page is open, such as the
  note being typed or whether an alert is loading. React redraws the page when
  state changes.
- **API:** the backend's web interface. This app uses it to look up a QR code,
  create an alert, and cancel an alert.
- **Token:** the identifier included in a QR sticker's URL. The web app
  sends it to the backend so the backend can find the matching QR record.
# QRAlalay_Website
