import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canUseUnlimitedCredits, isOwner, normalizeEmail, validPassword } from '../server/security.js';

describe('owner authorization', () => {
  const ownerEmail = 'albadawi730@gmail.com';
  it('requires exact configured email, verified status, and owner role', () => {
    assert.equal(isOwner({ email: ownerEmail, email_verified: 1, role: 'owner' }, ownerEmail), true);
    assert.equal(isOwner({ email: 'attacker@example.com', email_verified: 1, role: 'owner' }, ownerEmail), false);
    assert.equal(isOwner({ email: ownerEmail, email_verified: 0, role: 'owner' }, ownerEmail), false);
    assert.equal(isOwner({ email: ownerEmail, email_verified: 1, role: 'user' }, ownerEmail), false);
  });
  it('grants internal unlimited credit status only to verified owner', () => {
    assert.equal(canUseUnlimitedCredits({ email: ownerEmail, email_verified: 1, role: 'owner' }, ownerEmail), true);
    assert.equal(canUseUnlimitedCredits({ email: ownerEmail, email_verified: 0, role: 'owner' }, ownerEmail), false);
  });
});

describe('account input helpers', () => {
  it('normalizes email case and surrounding whitespace', () => assert.equal(normalizeEmail('  OWNER@EXAMPLE.COM '), 'owner@example.com'));
  it('requires a long password', () => { assert.equal(validPassword('short'), false); assert.equal(validPassword('this-is-a-long-password'), true); });
});
