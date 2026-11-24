# STB App

The internal business application for Sam Tech Builds. **One codebase, two deliverables:**

- **STB Website**: `npm run build` → `dist/`, hosted on Cloudflare Pages, used in desktop and mobile browsers.
- **STB App for Android**: a signed APK built with Capacitor from the same code. The app's files are packaged inside
  the APK (it does not load the hosted website). See [docs/ANDROID.md](docs/ANDROID.md).

Both sign in with the same STB Core staff accounts and read and write the same records under the same RLS rules.
Everything that differs by platform lives in `src/lib/platform.ts` (share, clipboard, browser, back button, status bar,
network status, password-reset redirect).

Included now (Delivery MVP foundation):
- Supabase Auth sign-in, owner-only access (`staff` table), optional TOTP two-factor, enforced in the database once enrolled.
- Clients, projects and support periods.
- Deliveries: create from a project, edit every client-facing field, theme, checklist, screenshots and files (private storage),
  preview, publish/unpublish, revoke/reinstate, client links (shown once, only a hash stored), revoke links, activity.
- Settings: the STB visiting card shown on every delivery, two-factor setup, light/dark/system theme, app version.

Planned in later phases (both formats get them automatically): leads, tasks, finance and invoices, documents,
maintenance, analytics, staff roles.

```bash
npm ci
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DELIVERY_SITE_URL, VITE_APP_WEB_URL
npm run dev                  # website at http://localhost:5173
npm test                     # unit tests (web and Android code paths)
npx playwright test          # full admin flow against an in-memory Supabase mock (system Chrome)
npm run build                # STB Website
npm run android:sync         # build + copy into android/
npm run android:open         # open in Android Studio
```

Deploy: `stb-core/docs/DEPLOY.md` steps 3–5.
