# JAMIL AI — Phase 1 foundation

This repository is the preserved Vite + React + TypeScript frontend shell with a same-origin-ready Express API foundation. Current implementation covers local SQLite persistence, password registration/login, opaque HttpOnly server sessions, exact owner authorization, account profile, credit ledger, manual payment review, and private asset/operation metadata endpoints. AI providers and file object storage are intentionally reported as not configured; there are no fake generation results or paid API calls.

## Requirements and setup

Node.js 20+ and npm are recommended. The tracked lockfile must be refreshed after dependencies changed; run `npm install` (not `npm ci`) the first time, then commit the resulting lockfile update.

```sh
cp .env.example .env
# Set a unique OWNER_PASSWORD (>=16 chars) and a random SESSION_SECRET (>=32 chars) in .env
npm install
npm run db:seed
npm run dev
```

Frontend: http://localhost:5173. API: http://localhost:4000/api/health. Do not publish `.env` or the local database. In production, set secrets through the hosting provider's secret manager, use HTTPS, set `NODE_ENV=production`, `OWNER_EMAIL=albadawi730@gmail.com`, and configure a durable database and object-store adapter before deployment. This SQLite starter is for a single-instance foundation, not horizontally scaled production.

## Scripts

- `npm run dev` — Vite frontend and API in watch mode.
- `npm run server` — API only.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` — frontend build and checks / foundation unit tests.
- `npm run db:seed` — explicitly provisions or resets the configured owner password. Run only with controlled secret access.

## API foundation

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `PATCH /api/profile`
- `GET /api/wallet`, `POST /api/payments`, `GET /api/payments/mine`
- Owner-only: `/api/admin/summary`, `/api/admin/users`, `/api/admin/wallet/adjust`, `/api/admin/payments`, `/api/admin/payments/:id/review`, `/api/admin/providers`
- `GET /api/assets`, `GET /api/operations`

Owner access requires all of configured email match, database role `owner`, and verified status. The only supported provisioning route is the server-side seed command; public registration refuses the owner email. The wallet reports owner `unlimited: true` and does not create or deduct owner credits. Non-owner changes are transactionally recorded and payment approval is idempotent.

## Limitations

Email verification delivery and password reset need an email service; public accounts are therefore unverified until a verified flow is implemented. No user file upload or downloadable object storage is enabled yet. The assets API exposes only user-scoped metadata. AI providers (Whisper/Piper/FFmpeg/image/video), queued jobs, production migrations, managed database, native mobile builds, and complete admin UI remain future work. PWA shell caching is included; API functionality requires a network. Review security and infrastructure before production use.
