/** Same minimum the API enforces for new passwords. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordProblem = 'too-short' | 'mismatch';

/** Client-side check before a password change (the API validates again). */
export function passwordProblem(password: string, repeat: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too-short';
  if (password !== repeat) return 'mismatch';
  return null;
}
