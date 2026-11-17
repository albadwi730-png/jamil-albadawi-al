# TODO — prioritized

## Foundation follow-up
- [ ] Install dependencies and refresh `package-lock.json`; execute typecheck, lint, test, build and fix failures.
- [ ] Add integration tests for registration/login/session isolation, owner routes, wallet atomicity, and payment idempotency.
- [ ] Add real email verification and password reset using an approved mail provider; never mark users verified based on submitted email alone.
- [ ] Add rate limiting, CSRF token strategy, session rotation/revocation policy, backup/restore and structured redacted audit logs.
- [ ] Replace SQLite for multi-instance deployment with a managed database and versioned migrations.
- [ ] Build actual Arabic/English UI for login, profile, wallet, payment review, users, and admin dashboard; use server APIs.
- [ ] Add durable object storage adapter, signed access URLs, upload limits/content checks and delete/rename.
- [ ] Add background worker/job system; deploy open-source models only after resource/license review and Arabic quality tests.
- [ ] Integrate tested TTS/STT, image and video engines only when available; provider statuses must reflect real health.
- [ ] Finish installable PWA UX; add Capacitor Android/iOS wrappers and execute platform builds/signing in suitable environments.
- [ ] Add CI and production deployment documentation only after security and operational review.
