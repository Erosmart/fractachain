import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';

// Firebase Configuration from environment variables
// (Permite usar Firebase Auth directamente sin necesidad de crear proyectos complejos en GCP)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'mock_firebase_api_key_fractachain',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'fractachain.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'fractachain-rwa',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'fractachain-rwa.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '104829104820',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:104829104820:web:8f9a2b1c',
};

// Initialize Firebase only once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Custom parameters for Google OAuth via Firebase
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function loginWithFirebaseGoogle(): Promise<{
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  idToken: string;
}> {
  if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'mock_firebase_api_key_fractachain') {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const idToken = await user.getIdToken();
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Usuario Google',
      photoURL: user.photoURL || '',
      idToken,
    };
  }
  throw new Error('Google no está configurado. Entrá con email y contraseña, o cargá las claves de Firebase.');
}

export async function logoutFromFirebase(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {
    // Ignore error if offline
  }
}
