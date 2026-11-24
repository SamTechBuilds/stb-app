# STB App for Android (APK)

`stb-app` is one codebase with two distribution formats:

| Deliverable | Built by | Runs |
| --- | --- | --- |
| **STB Website** | `npm run build` → `dist/` → Cloudflare Pages | In any browser |
| **STB App (APK)** | `npx cap sync android` + Gradle → signed `.apk` | Installed on Android 7.0+ |

The APK is a real Android application built with Capacitor. The app's files (HTML, JavaScript, fonts, icons) are **packaged inside the APK** and run locally. It does not open the hosted website. Both formats sign in to the same STB Core project with the same staff accounts, and read and write the same records.

### What's Android-specific

- Launcher icon, adaptive icon and splash screen in STB colours.
- Hardware/gesture **back button**: closes an open dialog, then goes back, then leaves the app from the first screen.
- **Native share sheet** for client links (WhatsApp, Gmail, Messages…) and the native clipboard.
- **Preview** opens the delivery page in a Chrome Custom Tab, exactly as a client sees it.
- **Status bar** follows light/dark mode. An **offline banner** uses Android's network status.
- File uploads use Android's file and photo picker.
- Security: HTTPS only (cleartext blocked), app data excluded from cloud backup and device-to-device transfer, release builds not debuggable, WebView debugging off unless `STB_ANDROID_DEBUG=1` at sync time.

Package name: `com.samtechbuilds.stbapp` (debug builds: `com.samtechbuilds.stbapp.debug`, so both can be installed side by side).

---

## 1. Create your signing key (once, on your computer)

The key proves future updates come from you. **If you lose it, existing installs can never be updated.** Create it yourself and keep two copies (password manager and an offline USB drive).

You need a Java JDK 17+ (Android Studio includes one: use its `jbr/bin/keytool`).

```bash
keytool -genkeypair -v -keystore stb-release.jks -alias stb \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Sam Tech Builds, O=Sam Tech Builds, C=IN"
```

It asks for a keystore password. Use a long one and store it in your password manager. When asked for a key password, press Enter to use the same one.

Never commit `stb-release.jks` or its password to Git. `.gitignore` already ignores `*.jks` and `*.keystore`.

## 2. Configure GitHub (once)

In the `stb-app` repository → **Settings → Secrets and variables → Actions**.

**Variables** (not secret; they're compiled into the app like on the website):

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | STB Core anon / publishable key |
| `VITE_DELIVERY_SITE_URL` | `https://stb-delivery.pages.dev` (no trailing slash) |
| `VITE_APP_WEB_URL` | `https://stb-app.pages.dev` (the STB Website; used for password-reset emails) |

**Secrets**:

| Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore file as base64 (below) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `stb` |
| `ANDROID_KEY_PASSWORD` | key password (same as keystore password if you pressed Enter) |

To get the base64 text:

- macOS / Linux: `base64 -i stb-release.jks | tr -d '\n'`
- Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("stb-release.jks"))`

Paste the output into the secret. Don't save it in a file.

## 3. Build the signed APK

GitHub → **Actions → Android release APK → Run workflow**, enter a version name (e.g. `0.1.0`) and run.

The workflow:
1. runs the type-check and unit tests;
2. builds the web layer with your variables and copies it into the Android project;
3. builds `assembleRelease` signed with your key (v1 + v2 + v3 signatures);
4. verifies the signature with `apksigner` and fails if it isn't valid;
5. uploads `stb-app-<version>-<build>.apk` and `SHA256SUMS.txt` (including your signing certificate fingerprint) as an artifact for 30 days. Pushing a tag such as `v0.2.0` also attaches them to a GitHub Release.

The build number (`versionCode`) is the workflow run number, so every build can update the previous one.

Every push also runs **CI → Android app (debug build)**, which compiles the Android project without secrets. Keep it green.

### Building on your own computer instead

Install Android Studio (it includes the Android SDK and JDK 21). Then from `stb-app`:

```bash
npm ci
cp .env.example .env.production.local   # fill in the same four VITE_ values
npm run android:sync                    # type-check, build, copy into android/
```

Debug APK (for testing, no key needed):

```bash
cd android && ./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Signed release APK:

```bash
export STB_KEYSTORE_PATH=/full/path/to/stb-release.jks
export STB_KEYSTORE_PASSWORD='…'  STB_KEY_ALIAS=stb  STB_KEY_PASSWORD='…'
export STB_VERSION_NAME=0.1.0  STB_VERSION_CODE=1
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk
```

(PowerShell: `$env:STB_KEYSTORE_PATH="C:\keys\stb-release.jks"` and so on.) A release build without these variables stops with a clear error instead of producing an unsigned APK.

`npm run android:open` opens the project in Android Studio, where **Run** installs it on a connected phone.

## 4. Install on an Android phone

1. Download the APK artifact from GitHub on the phone (or copy it over USB).
2. Open it. Android asks to allow installs from that app (Chrome or Files): allow it for this install.
3. Open **STB App** and sign in with your staff account. If two-factor sign-in is on, enter your authenticator code.

To update, install a newer APK over the old one; you stay signed in. Android refuses an APK signed with a different key or with a lower build number.

To check an APK is yours: `apksigner verify --print-certs stb-app-….apk` should show the same certificate SHA-256 as `SHA256SUMS.txt` from your workflow run.

## 5. Android test checklist (before relying on the app)

Run these on a real phone with the release APK, against your live STB Core:

- [ ] App installs, shows the STB icon and splash, opens to Sign in.
- [ ] Wrong password shows the generic error; correct password signs in; two-factor code is required if enrolled.
- [ ] A non-owner account sees "This account can't use STB App".
- [ ] Overview, Clients, Projects, Deliveries and Settings all load; bottom tabs work.
- [ ] Create a client and project on the **phone**, then refresh the **STB Website**: they appear (same database).
- [ ] Edit a delivery on the website, reopen it in the app: the change is there.
- [ ] Upload a screenshot from the phone's gallery and a PDF from Files.
- [ ] Preview opens the delivery page in a Custom Tab.
- [ ] Create a client link → **Share** opens the Android share sheet; **Copy link** puts it on the clipboard.
- [ ] Back button: closes a confirm dialog, goes back a screen, leaves the app from Overview.
- [ ] Turn on airplane mode: the offline banner appears; turn it off: it disappears.
- [ ] Dark mode in Settings changes the status bar too.
- [ ] Close and reopen the app: still signed in. Sign out: back to Sign in.

## Updating icons

Replace the source images in `assets/` (`icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`, `splash-dark.png`), then run `npm run android:assets` and commit the regenerated files under `android/app/src/main/res/`.
