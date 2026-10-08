import { useEffect, useState } from 'react';
import { EmailAuthProvider, linkWithCredential, onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';

// A sign-in that survives a lost phone. Until a parent adds an email and password, their identity lives
// only inside one browser. Adding them ATTACHES the email to the identity they already have, so every
// ride, child and circle stays put; on a new phone, signing in with that email brings them straight back.

// The email on this sign-in right now, or null if it has never been given one. Updates when it changes.
export function useAccountEmail() {
  const [email, setEmail] = useState<string | null>(auth.currentUser?.email ?? null);
  useEffect(() => onIdTokenChanged(auth, (u) => setEmail(u?.email ?? null)), []);
  return email;
}

export async function addEmailToAccount(email: string, password: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
  // The sign-in token carries the email, so refresh it and every screen sees the new state.
  await user.getIdToken(true);
}

export async function signInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function emailPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

// Plain-language reasons for the errors people actually hit.
export function accountError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use')
    return 'That email already has an account. If it is yours, choose "I already have an account" on a new phone. Otherwise use a different email.';
  if (code === 'auth/weak-password') return 'Use at least 6 characters for the password.';
  if (code === 'auth/invalid-email' || code === 'auth/missing-email') return 'That email does not look right. Check it for typos.';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/user-not-found') return 'That email and password do not match.';
  if (code === 'auth/operation-not-allowed') return 'Email sign-in is not switched on yet. Ask whoever runs the app to turn it on.';
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a minute and try again.';
  if (code === 'auth/network-request-failed') return 'No connection. Check your signal and try again.';
  return 'Something went wrong. Try again in a moment.';
}
