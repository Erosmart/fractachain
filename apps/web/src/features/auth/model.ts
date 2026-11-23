import { MIN_PASSWORD_LENGTH } from '@/core/auth/passwordRules';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Used when `/api/legal` can't be read; the API checks the version it expects anyway. */
export const FALLBACK_TERMS_VERSION = '2026-10-30';

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  confirm: string;
  acceptTerms: boolean;
  acceptRisks: boolean;
}

export type SignupField = keyof SignupInput;
/** Keys under `account.signup.errors`. */
export type SignupError = 'name' | 'email' | 'password' | 'mismatch' | 'terms' | 'risks' | 'exists';

/** Field order = focus order when the form is submitted with errors. */
export const SIGNUP_FIELDS: readonly SignupField[] = [
  'name',
  'email',
  'password',
  'confirm',
  'acceptTerms',
  'acceptRisks',
];

export function validateSignup(input: SignupInput): Partial<Record<SignupField, SignupError>> {
  const errors: Partial<Record<SignupField, SignupError>> = {};
  if (input.name.trim().length < 2) errors.name = 'name';
  if (!EMAIL_RE.test(input.email.trim())) errors.email = 'email';
  if (input.password.length < MIN_PASSWORD_LENGTH) errors.password = 'password';
  else if (input.confirm !== input.password) errors.confirm = 'mismatch';
  if (!input.acceptTerms) errors.acceptTerms = 'terms';
  if (!input.acceptRisks) errors.acceptRisks = 'risks';
  return errors;
}

/** Live checklist under the password field. */
export function passwordChecks(password: string, confirm: string) {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    match: password.length > 0 && password === confirm,
  };
}

export function firstInvalid<F extends string>(
  order: readonly F[],
  errors: Partial<Record<F, unknown>>,
): F | null {
  return order.find((f) => errors[f]) ?? null;
}
