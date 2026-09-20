import { upsertLogin } from './accounts';

export function authenticateWithFirebase(payload: {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  idToken?: string;
}) {
  const result = upsertLogin({
    uid: payload.uid,
    email: payload.email,
    name: payload.displayName,
    avatar: payload.photoURL,
  });
  return {
    success: true,
    user: result.user,
    token: result.token,
    message: 'Autenticación con Firebase completada',
  };
}

export function getFirebaseUserByToken(token?: string) {
  const { getAccountByToken, toPublic } = require('./accounts');
  const account = getAccountByToken(token);
  return account ? toPublic(account) : undefined;
}
