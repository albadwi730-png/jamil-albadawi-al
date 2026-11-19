# JAMIL AI — Phase 2 implementation notes

## Changes on this branch

- Replaced the Vite starter placeholder with a responsive Arabic-first JAMIL AI shell, with RTL/LTR and light/dark modes.
- Added Supabase browser client configuration with public URL/anon key only.
- Added email/password sign-in and sign-up UI using Supabase Auth; profile is fetched from the database after login.
- Added a PostgreSQL migration for profiles, wallets, immutable wallet ledger entries, plans, payment requests, AI jobs, assets, voice models, user settings, notifications, and audit logs.
- Enabled row-level security and user-scoped private Storage bucket policies.
- Added verified-email owner promotion for `albadawi730@gmail.com`; client-supplied role metadata is not trusted.
- Added a server-role-only atomic wallet transaction RPC with row locking and idempotency.
- Added a PWA manifest, SVG icons, and a service worker that caches only the app shell/static same-origin resources (not API calls or private user media).
- Added a Capacitor app identity configuration as preparation only.

## Validation status

The GitHub connector can write files and commits but this environment did not provide a checked-out Node runtime, Supabase project, deployment secrets, or Android/iOS build toolchains. Therefore:

- No `npm run build`, `npm run typecheck`, lint, SQL migration execution, or browser test has been run.
- Supabase Auth, database, RLS, Storage, owner promotion, and wallet RPC are not live until the migration is applied to a configured Supabase project and tested.
- AI generation engines, job workers, payment gateway, production hosting, push notifications, APK/AAB, and signed iOS app are not implemented or produced by this phase.
- AI tool cards intentionally show that a provider engine is required; no fake generation or credit deduction is performed.

## Required owner action before live testing

Configure Supabase project URL and anon/publishable key in deployment environment, apply the migration to a fresh/staging project, configure Auth email confirmation and redirect URLs, then test with a normal user and the verified owner account. Do not add the service-role key to frontend environment variables or Git.
