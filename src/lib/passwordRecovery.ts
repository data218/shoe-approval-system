import { isListedUser } from './access.ts';
import type { ListedProfile } from './access.ts';

interface RecoveryAuth {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): PromiseLike<{ error: { message: string } | null }>;
}
interface PasswordAuth {
  updateUser(attributes: { password: string }): PromiseLike<{ error: { message: string } | null }>;
}

export async function requestRecoveryLink(auth: RecoveryAuth, email: string, origin: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Enter a valid email address.');
  const { error } = await auth.resetPasswordForEmail(normalized, { redirectTo: new URL('/update-password', origin).toString() });
  if (error) throw new Error(error.message);
}

export async function updateListedUserPassword(
  auth: PasswordAuth, userId: string | null | undefined, profile: ListedProfile | null,
  password: string, confirmation: string,
): Promise<void> {
  validatePasswordChange(userId, profile, password, confirmation);
  const { error } = await auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

function validatePasswordChange(userId: string | null | undefined, profile: ListedProfile | null, password: string, confirmation: string): void {
  if (!isListedUser(userId, profile)) throw new Error('Your reset session is invalid or has expired. Request a new reset link.');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{6,}$/.test(password)) {
    throw new Error('Use at least 6 characters, including a letter, a number and a special character.');
  }
}

interface OwnPasswordAuth extends PasswordAuth {
  getUser(): PromiseLike<{ data: { user: { id: string; email?: string } | null }; error: { message: string } | null }>;
  signInWithPassword(credentials: { email: string; password: string }): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
}

export async function changeOwnPassword(
  auth: OwnPasswordAuth, userId: string | null | undefined, profile: ListedProfile | null,
  currentPassword: string, password: string, confirmation: string,
): Promise<void> {
  validatePasswordChange(userId, profile, password, confirmation);
  if (!currentPassword) throw new Error('Enter your current password.');
  if (currentPassword === password) throw new Error('Choose a different new password.');
  const current = await auth.getUser();
  if (current.error || !current.data.user || current.data.user.id !== userId || !current.data.user.email) {
    throw new Error('Your session could not be verified. Please sign in again.');
  }
  const verified = await auth.signInWithPassword({ email: current.data.user.email, password: currentPassword });
  if (verified.error || verified.data.user?.id !== userId) throw new Error('Current password could not be verified. Please try again.');
  await updateListedUserPassword(auth, userId, profile, password, confirmation);
}

export function recoveryLinkError(hash: string, search: string): string | null {
  const params = [new URLSearchParams(hash.replace(/^#/, '')), new URLSearchParams(search)];
  return params.some((p) => p.has('error') || p.has('error_code'))
    ? 'This reset link is invalid or has expired. Request a new reset link.' : null;
}
