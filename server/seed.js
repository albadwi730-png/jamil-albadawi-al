import 'dotenv/config';
import { createDatabase } from './db.js';
import { hashPassword, newId, normalizeEmail } from './security.js';

const email = normalizeEmail(process.env.OWNER_EMAIL);
const password = process.env.OWNER_PASSWORD;
if (!email || !password || password.length < 16) {
  console.error('Set OWNER_EMAIL and OWNER_PASSWORD (at least 16 characters) in your secret environment before provisioning the owner.');
  process.exit(1);
}
const db = createDatabase();
const found = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (found) {
  db.prepare("UPDATE users SET role='owner',email_verified=1,disabled=0,password_hash=? WHERE id=?").run(await hashPassword(password), found.id);
} else {
  const id = newId();
  const insert = db.transaction(() => {
    db.prepare("INSERT INTO users(id,email,password_hash,display_name,role,email_verified) VALUES(?,?,?,'JAMIL AI Owner','owner',1)").run(id, email, await hashPassword(password));
  });
  insert();
}
console.log(`Owner provisioned for ${email}. Keep OWNER_PASSWORD secret and remove it from the shell after use.`);
