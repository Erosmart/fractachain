import { useCallback, useEffect, useRef, useState } from 'react';
import type { KycProviderInfo, VerificationView } from '@fractachain/shared';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import {
  isTrustedVerificationUrl,
  pollDelay,
  presentStage,
  type StagePresentation,
} from '@/core/onboarding/verification';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { onboarding, auth } = container.services;
const { navigator } = container;

/** Which KYC flow the API runs (Didit or the in-app selfie). */
export function useKycProvider() {
  const [info, setInfo] = useState<KycProviderInfo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    onboarding
      .kycProvider()
      .then((p) => live && setInfo(p))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
  }, []);
  return { info, error };
}

export interface VerificationState {
  view: VerificationView | null;
  presentation: StagePresentation | null;
  /** First load (or sync) still running. */
  loading: boolean;
  /** A re-read is in flight (keeps the last card on screen). */
  refreshing: boolean;
  error: string;
  /** Redirecting to the provider. */
  leaving: boolean;
  checkedAt: Date | null;
  refresh: () => Promise<void>;
  /** Start / resume / restart the hosted verification and leave the page. */
  verify: () => Promise<void>;
}

/**
 * Verification status for the signed-in investor. `sync: true` asks the API
 * to re-read the decision from the provider first (callback, pending page);
 * while the stage is pending it keeps re-reading with backoff.
 */
export function useVerification({ sync }: { sync: boolean }): VerificationState {
  const { user } = useSession();
  const { locale } = useI18n();
  const [view, setView] = useState<VerificationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const attempt = useRef(0);
  const userId = user?.id;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const provider = await onboarding.kycProvider();
      // Manual flow has no hosted session to sync; the session user carries the status.
      const next =
        provider.provider === 'didit'
          ? await (sync ? onboarding.syncVerification() : onboarding.verificationStatus())
          : await onboarding.verificationStatus();
      setView(next);
      // Keep the header chip and the guards in step with the decision.
      if (next.kycStatus !== container.stores.session.getSnapshot().user?.kycStatus) await auth.refresh();
      setError('');
      setCheckedAt(new Date());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sync]);

  useEffect(() => {
    if (!userId) return;
    attempt.current = 0;
    void load();
  }, [userId, load]);

  const presentation = view ? presentStage(view) : null;

  // Re-read with backoff while someone else (Didit, compliance) is deciding.
  useEffect(() => {
    if (!presentation?.poll || leaving || typeof window === 'undefined') return;
    const id = window.setTimeout(() => {
      if (document.hidden) return;
      attempt.current += 1;
      void load();
    }, pollDelay(attempt.current));
    return () => window.clearTimeout(id);
  }, [presentation?.poll, presentation?.stage, checkedAt, leaving, load]);

  const verify = useCallback(async () => {
    setError('');
    const resume = view?.session?.resumeUrl;
    setLeaving(true);
    try {
      const url =
        resume && presentation?.stage !== 'expired' && isTrustedVerificationUrl(resume)
          ? resume
          : await onboarding.startVerification(locale);
      navigator.navigate(url);
    } catch (err) {
      setLeaving(false);
      setError(errorMessage(err));
    }
  }, [view, presentation?.stage, locale]);

  return { view, presentation, loading, refreshing, error, leaving, checkedAt, refresh: load, verify };
}
