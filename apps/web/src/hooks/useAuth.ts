import { useMemo } from 'react';
import { container } from '@/core/container';
import { useSession } from './useSession';

const { auth, onboarding, investor } = container.services;

/**
 * Session state plus every account action, under the names the screens used
 * with the old React context. Methods are stable references (bound in their
 * services), so they are safe in dependency arrays.
 */
export function useAuth() {
  const session = useSession();
  return useMemo(
    () => ({
      ...session,
      loginWithEmail: auth.loginWithEmail,
      loginWithWallet: auth.loginWithWallet,
      loginWithGoogle: auth.loginWithGoogle,
      logout: auth.logout,
      refreshUser: auth.refresh,
      chooseCustody: onboarding.chooseCustody,
      linkFreighterWallet: onboarding.linkFreighterWallet,
      submitKyc: onboarding.submitKyc,
      approveToken: investor.approveToken,
      claimTokens: investor.claimTokens,
      distributeTokens: investor.distributeTokens,
      fetchWalletSecret: investor.fetchWalletSecret,
      claimDividends: investor.claimDividends,
      finalizeOffering: investor.finalizeOffering,
      refundContribution: investor.refundContribution,
    }),
    [session],
  );
}
