import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { createDatabase } from './db.js';
import { canUseUnlimitedCredits, hashPassword, hashToken, isOwner, makeSessionToken, newId, normalizeEmail, validPassword, verifyPassword } from './security.js';

const app = express();
const db = createDatabase();
const port = Number(process.env.PORT || 4000);
const ownerEmail = normalizeEmail(process.env.OWNER_EMAIL);
const production = process.env.NODE_ENV === 'production';
const sessionHours = Number(process.env.SESSION_HOURS || 168);
if (production && (!process.env.SESSION_SECRET || !ownerEmail)) throw new Error('SESSION_SECRET and OWNER_EMAIL are required in production');

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// SameSite cookies plus an exact Origin check for browser mutations mitigate CSRF.
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const allowed = new URL(process.env.FRONTEND_URL || 'http://localhost:5173').origin;
    if (origin && origin !== allowed) return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});

function userView(row) {
  if (!row) return null;
  const owner = isOwner(row, ownerEmail);
  return { id: row.id, email: row.email, displayName: row.display_name, role: owner ? 'owner' : row.role === 'owner' ? 'user' : row.role, emailVerified: Boolean(row.email_verified), locale: row.locale, unlimitedCredits: owner };
}
function requireAuth(req, res, next) {
  const token = req.cookies?.jamil_session;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const session = db.prepare('SELECT user_id FROM sessions WHERE id_hash = ? AND expires_at > ?').get(hashToken(token), Date.now());
  const row = session && db.prepare('SELECT * FROM users WHERE id = ? AND disabled = 0').get(session.user_id);
  if (!row) return res.status(401).json({ error: 'Session expired or account unavailable' });
  req.user = row;
  next();
}
function requireOwner(req, res, next) {
  if (!isOwner(req.user, ownerEmail)) return res.status(403).json({ error: 'Owner access required' });
  next();
}
function setSession(res, userId) {
  const token = makeSessionToken();
  db.prepare('INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token), userId, Date.now() + sessionHours * 3600000);
  res.cookie('jamil_session', token, { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge: sessionHours * 3600000 });
}
const registerSchema = z.object({ email: z.string().email().max(254), password: z.string(), displayName: z.string().trim().min(1).max(80) });

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: 'connected', ai: 'not_configured' }));
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    if (!validPassword(data.password)) return res.status(400).json({ error: 'Password must be 12-200 characters' });
    const email = normalizeEmail(data.email);
    if (email === ownerEmail) return res.status(403).json({ error: 'Owner account must be provisioned by the administrator' });
    const id = newId();
    const transaction = db.transaction(() => {
      db.prepare('INSERT INTO users(id,email,password_hash,display_name) VALUES(?,?,?,?)').run(id, email, awaitHash, data.displayName);
      db.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0)').run(id);
    });
    const awaitHash = await hashPassword(data.password);
    transaction();
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    setSession(res, id);
    res.status(201).json({ user: userView(user), notice: 'Account created. Email verification is not configured; account is unverified.' });
  } catch (error) { if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email is already registered' }); next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!row || row.disabled || !(await verifyPassword(String(req.body?.password || ''), row.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    setSession(res, row.id);
    res.json({ user: userView(row) });
  } catch (error) { next(error); }
});
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.jamil_session;
  if (token) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hashToken(token));
  res.clearCookie('jamil_session', { httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
  res.status(204).end();
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: userView(req.user) }));
app.patch('/api/profile', requireAuth, (req, res) => {
  const schema = z.object({ displayName: z.string().trim().min(1).max(80).optional(), locale: z.enum(['ar', 'en']).optional() });
  const data = schema.parse(req.body);
  db.prepare('UPDATE users SET display_name=COALESCE(?,display_name), locale=COALESCE(?,locale) WHERE id=?').run(data.displayName ?? null, data.locale ?? null, req.user.id);
  res.json({ user: userView(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
});

app.get('/api/wallet', requireAuth, (req, res) => {
  const owner = isOwner(req.user, ownerEmail);
  const account = db.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').get(req.user.id);
  const transactions = db.prepare('SELECT id,amount,kind,note,created_at AS createdAt FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({ unlimited: owner, balance: owner ? null : account?.balance ?? 0, transactions });
});
app.post('/api/payments', requireAuth, (req, res) => {
  const schema = z.object({ amount: z.number().int().positive().max(10000000), receiptKey: z.string().max(500).optional() });
  const data = schema.parse(req.body);
  const id = newId();
  db.prepare('INSERT INTO payment_requests(id,user_id,amount,receipt_key) VALUES(?,?,?,?)').run(id, req.user.id, data.amount, data.receiptKey || null);
  res.status(201).json({ id, status: 'pending', notice: 'Payment requests require owner review; no payment is processed automatically.' });
});
app.get('/api/payments/mine', requireAuth, (req, res) => res.json({ requests: db.prepare('SELECT id,amount,status,created_at AS createdAt FROM payment_requests WHERE user_id=? ORDER BY created_at DESC').all(req.user.id) }));
app.get('/api/admin/summary', requireAuth, requireOwner, (_req, res) => {
  res.json({ users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count, paymentsPending: db.prepare("SELECT COUNT(*) AS count FROM payment_requests WHERE status='pending'").get().count, operations: db.prepare('SELECT COUNT(*) AS count FROM operation_logs').get().count });
});
app.get('/api/admin/users', requireAuth, requireOwner, (_req, res) => res.json({ users: db.prepare('SELECT id,email,display_name AS displayName,role,email_verified AS emailVerified,disabled,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 500').all() }));
app.patch('/api/admin/users/:id', requireAuth, requireOwner, (req, res) => {
  const schema = z.object({ disabled: z.boolean().optional(), role: z.enum(['user','admin']).optional() });
  const patch = schema.parse(req.body);
  const target = db.prepare('SELECT id,email,role FROM users WHERE id=?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner' || normalizeEmail(target.email) === ownerEmail) return res.status(403).json({ error: 'Owner account is protected' });
  if (patch.disabled !== undefined) db.prepare('UPDATE users SET disabled=? WHERE id=?').run(Number(patch.disabled), target.id);
  if (patch.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(patch.role, target.id);
  if (patch.disabled) db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
  res.json({ ok: true });
});
app.post('/api/admin/wallet/adjust', requireAuth, requireOwner, (req, res) => {
  const data = z.object({ userId: z.string().uuid(), amount: z.number().int().refine((value) => value !== 0), reference: z.string().min(8).max(120), note: z.string().max(500).optional() }).parse(req.body);
  const target = db.prepare('SELECT id,role,email FROM users WHERE id=?').get(data.userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isOwner({ ...target, email_verified: 1 }, ownerEmail)) return res.status(400).json({ error: 'Owner does not use internal credits' });
  const apply = db.transaction(() => {
    db.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0) ON CONFLICT(user_id) DO NOTHING').run(target.id);
    const account = db.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').get(target.id);
    if (account.balance + data.amount < 0) throw Object.assign(new Error('Insufficient balance'), { status: 409 });
    db.prepare('UPDATE wallet_accounts SET balance=balance+?,updated_at=datetime(\'now\') WHERE user_id=?').run(data.amount, target.id);
    db.prepare('INSERT INTO wallet_transactions(id,user_id,amount,kind,reference,note,created_by) VALUES(?,?,?,?,?,?,?)').run(newId(), target.id, data.amount, 'admin_adjustment', data.reference, data.note || null, req.user.id);
  });
  try { apply(); } catch (error) { if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Reference already processed' }); if (error.status) return res.status(error.status).json({ error: error.message }); throw error; }
  res.json({ ok: true, balance: db.prepare('SELECT balance FROM wallet_accounts WHERE user_id=?').get(target.id).balance });
});
app.get('/api/admin/payments', requireAuth, requireOwner, (_req, res) => res.json({ requests: db.prepare('SELECT p.id,p.user_id AS userId,u.email,p.amount,p.status,p.created_at AS createdAt FROM payment_requests p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 500').all() }));
app.post('/api/admin/payments/:id/review', requireAuth, requireOwner, (req, res) => {
  const action = z.object({ decision: z.enum(['approved','rejected']) }).parse(req.body).decision;
  const payment = db.prepare('SELECT * FROM payment_requests WHERE id=?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment request not found' });
  const review = db.transaction(() => {
    const changed = db.prepare("UPDATE payment_requests SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'").run(action, req.user.id, payment.id).changes;
    if (!changed) throw Object.assign(new Error('Payment already reviewed'), { status: 409 });
    if (action === 'approved') {
      db.prepare('INSERT INTO wallet_accounts(user_id,balance) VALUES(?,0) ON CONFLICT(user_id) DO NOTHING').run(payment.user_id);
      db.prepare('UPDATE wallet_accounts SET balance=balance+?,updated_at=datetime(\'now\') WHERE user_id=?').run(payment.amount, payment.user_id);
      db.prepare('INSERT INTO wallet_transactions(id,user_id,amount,kind,reference,note,created_by) VALUES(?,?,?,?,?,?,?)').run(newId(), payment.user_id, payment.amount, 'deposit', `payment:${payment.id}`, 'Approved manual payment', req.user.id);
    }
  });
  try { review(); } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); throw error; }
  res.json({ ok: true, status: action });
});
app.get('/api/assets', requireAuth, (req, res) => res.json({ assets: db.prepare('SELECT id,name,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt FROM assets WHERE user_id=? ORDER BY created_at DESC LIMIT 200').all(req.user.id), storageConfigured: Boolean(process.env.OBJECT_STORAGE_ENDPOINT) }));
app.get('/api/operations', requireAuth, (req, res) => res.json({ operations: db.prepare('SELECT id,tool,status,failure_reason AS failureReason,credits_used AS creditsUsed,created_at AS createdAt FROM operation_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id) }));
app.get('/api/admin/providers', requireAuth, requireOwner, (_req, res) => res.json({ providers: { whisper: 'not_configured', piper: 'not_configured', ffmpeg: 'not_configured', image: 'not_configured', video: 'not_configured' }, notice: 'No AI engine is enabled; no paid services are called.' }));

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: error.issues.map(({ path, message }) => ({ path: path.join('.'), message })) });
  console.error(error.message);
  res.status(500).json({ error: 'Internal server error' });
});
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`JAMIL AI API listening on ${port}`));
export { app, db, canUseUnlimitedCredits, isOwner };
