import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordResetLink, resetPasswordSchema, resetRequestSchema } from "../src/lib/password-reset";

test("password reset links use only the configured origin and safe order return", () => {
  const token = 'A'.repeat(24);
  const link = new URL(passwordResetLink(token, '/reset-password?next=%2Forders%2Fnew%3Fservice%3Dsanger', 'https://demo.example.test'));
  assert.equal(link.origin, 'https://demo.example.test');
  assert.equal(link.pathname, '/reset-password');
  assert.equal(link.searchParams.get('next'), '/orders/new?service=sanger');
  assert.equal(link.searchParams.get('token'), token);
  for (const callback of ['https://evil.example/reset-password?next=/dashboard', '/reset-password?next=https://evil.example', '/login?next=/dashboard']) {
    const unsafe = new URL(passwordResetLink(token, callback, 'https://demo.example.test'));
    assert.equal(unsafe.origin, 'https://demo.example.test');
    assert.equal(unsafe.searchParams.has('next'), false);
  }
  assert.throws(() => passwordResetLink(token, '/', 'https://name:secret@example.test'));
  assert.throws(() => passwordResetLink('bad', '/', 'https://demo.example.test'));
});

test("password reset input normalizes email, bounds secrets and rejects extra fields", () => {
  assert.equal(resetRequestSchema.parse({ email: ' Customer@Example.test ' }).email, 'customer@example.test');
  assert.equal(resetRequestSchema.safeParse({ email: 'not-email' }).success, false);
  const token = 'A'.repeat(24);
  assert.equal(resetPasswordSchema.safeParse({ token, newPassword: 'short' }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token, newPassword: 'x'.repeat(129) }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token, newPassword: 'StrongPassword!', emailVerified: true }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token, newPassword: 'StrongPassword!' }).success, true);
});
