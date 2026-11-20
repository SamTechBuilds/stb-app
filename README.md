# STB App + Web

The internal business management platform for Sam Tech Builds: one responsive React PWA.
Desktop gets a sidebar and full editors; phones get a bottom tab bar and the same screens, stacked.

Included now (Delivery MVP foundation):
- Supabase Auth sign-in, owner-only access (`staff` table), optional TOTP two-factor (enforced in the database once enrolled).
- Clients, projects and support periods.
- Deliveries: create from a project, edit every client-facing field, theme, checklist, screenshots and files (private storage),
  preview, publish/unpublish, revoke/reinstate, client links (shown once, only a hash stored), revoke links, activity.
- Settings: the STB visiting card shown on every delivery, two-factor setup, light/dark/system theme.
- Installable PWA (manifest + a service worker that caches only the app shell, never Supabase data).

Planned in later phases: leads, tasks, finance, documents, maintenance, analytics, staff roles.

```bash
npm ci
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DELIVERY_SITE_URL
npm run dev
npm test                     # unit tests
npx playwright test          # full admin flow against an in-memory Supabase mock (system Chrome)
npm run build
```

Deploy: see `stb-core/docs/DEPLOY.md` step 4.
