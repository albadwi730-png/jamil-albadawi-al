import { randomBytes, createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const makeSessionToken = () => randomBytes(32).toString('base64url');
export const newId = () => randomUUID();
export const isOwner = (user, ownerEmail) => Boolean(user && user.email_verified && user.role === 'owner' && normalizeEmail(user.email) === normalizeEmail(ownerEmail));
export const canUseUnlimitedCredits = isOwner;
export const hashPassword = (password) => bcrypt.hash(password, 12);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
export function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 200;
}
