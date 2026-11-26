# Android push notifications (FCM) setup for QRAlalay

**Status (2026-11-26):** push is **not configured and has not been tested**. Until these steps are done and
tested on a phone, do not describe push notifications as working.

Without FCM the installed app still works. It cannot get a push token, so the Push Notifications switch
stays hidden, and requests and assignments update only while the app is open (live updates and refresh).

Android Expo Go cannot receive remote push notifications, so push can only be tested in an installed APK.

## What you need
| Item | What it is | Where it goes | Commit to Git? |
|---|---|---|---|
| `google-services.json` | Firebase app config for package `app.qralalay.mobile` | Uploaded to EAS as a file variable; a local copy may sit in `QRAlalay-Mobile/` | **No** (already in `.gitignore`) |
| FCM V1 service-account key (`*.json`) | Private key that lets Expo's push service send through Firebase | Uploaded to EAS credentials only | **Never.** Do not email or paste it anywhere. |

## Steps
1. **Create the Firebase project.** Go to <https://console.firebase.google.com>, choose **Add project**, and name it QRAlalay. Google Analytics is not needed.
2. **Add the Android app.** In Project settings → General, choose **Add app → Android** and enter the package name `app.qralalay.mobile` exactly. Skip the SHA-1 for now.
3. **Download `google-services.json`.** Save it to `QRAlalay-Mobile/google-services.json`. Git ignores it.
4. **Give it to EAS without committing it.** From `QRAlalay-Mobile`:
   ```
   npx eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment preview --environment production
   ```
   Then ask the mobile session to add `android.googleServicesFile`. This means converting `app.json` to `app.config.js` so it reads `process.env.GOOGLE_SERVICES_JSON` and falls back to `./google-services.json`. **Do not add this setting before the file exists**, or the build will fail.
5. **Create the FCM V1 key.** In Firebase Project settings → **Service accounts**, choose **Generate new private key**. A JSON file downloads. Keep it out of the project folder.
6. **Upload the key to EAS.**
   ```
   npx eas-cli@latest credentials
   ```
   Choose Android → the build profile → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → upload the JSON. After that you can delete your local copy.
7. **Check the backend.** The Supabase `notification-worker` sends through Expo's push service. `EXPO_ACCESS_TOKEN` is only required if "Enhanced push security" is turned on in the Expo account (it is currently not set). The worker must also be scheduled. Codex should confirm both.
8. **Build and test.** Only after steps 1–7, build a new APK, then:
   - [ ] Sign in, accept the privacy terms, and allow notifications.
   - [ ] Settings shows **Push Notifications** (it appears only after a token is obtained).
   - [ ] Close the app on the responder phone, then assign that responder from the official account. A notification arrives within about a minute.
   - [ ] Turn the switch off, repeat, and check that no notification arrives.
   - [ ] Record the results in the release report before claiming push works.

## Do not
- Commit, share or paste either JSON file.
- Put Firebase values in `eas.json` (unlike the Supabase publishable key, they are managed as EAS secrets).
