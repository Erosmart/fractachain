import type { FirebaseLoginBody } from '../api/AuthApi';
import type { FirebaseWebConfig } from '../config/AppConfig';
import type { Translate } from '../i18n/translate';

/** Google sign-in port; the only implementation is Firebase, loaded on demand. */
export interface IGoogleAuthProvider {
  readonly configured: boolean;
  signIn(): Promise<FirebaseLoginBody>;
  signOut(): Promise<void>;
}

/**
 * Firebase Auth behind a dynamic import: the SDK (hundreds of KB) is fetched
 * only when someone presses the Google button or signs out of a Google session.
 */
export class FirebaseAuthProvider implements IGoogleAuthProvider {
  private auth: Promise<import('@firebase/auth').Auth> | null = null;

  constructor(
    private readonly config: FirebaseWebConfig,
    readonly configured: boolean,
    private readonly t: Translate,
  ) {}

  async signIn(): Promise<FirebaseLoginBody> {
    if (!this.configured) throw new Error(this.t('err.googleNotConfigured'));
    const [{ GoogleAuthProvider, signInWithPopup }, auth] = await Promise.all([
      import('@firebase/auth'),
      this.getAuth(),
    ]);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const { user } = await signInWithPopup(auth, provider);
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || this.t('err.googleUser'),
      photoURL: user.photoURL || '',
      idToken: await user.getIdToken(),
    };
  }

  async signOut(): Promise<void> {
    if (!this.configured || !this.auth) return;
    try {
      const [{ signOut }, auth] = await Promise.all([import('@firebase/auth'), this.auth]);
      await signOut(auth);
    } catch {
      // offline or never initialized: nothing to sign out of
    }
  }

  private getAuth(): Promise<import('@firebase/auth').Auth> {
    this.auth ??= (async () => {
      const [{ initializeApp, getApps, getApp }, { getAuth }] = await Promise.all([
        import('@firebase/app'),
        import('@firebase/auth'),
      ]);
      const app = getApps().length > 0 ? getApp() : initializeApp(this.config);
      return getAuth(app);
    })();
    return this.auth;
  }
}
