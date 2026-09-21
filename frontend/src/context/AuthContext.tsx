'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../lib/api';
import { loginWithFirebaseGoogle, logoutFromFirebase } from '../lib/firebase';

export type CustodyMode = 'CUSTODIAL' | 'SELF' | null;
export type KycStatus = 'UNREGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  publicKey: string;
  custodyMode: CustodyMode;
  kycStatus: KycStatus;
  kycId?: string;
  legalName?: string;
  cuit?: string;
  selfieUrl?: string;
  custodialWallet?: string;
  authProvider?: string;
  holdings?: { listingId: string; tokenTicker: string; usdcAmount: number; tokens: number; tokensOwed?: number; tokensOnChain?: number; pendingDividendUsdc?: number; refundedAt?: string; refundHash?: string }[];
  trustlines?: string[];
  cashUsdc?: number;
  xlmBalance?: number;
  faucetFunded?: boolean;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  revealedSecret: string | null;
  loginWithGoogle: () => Promise<User>;
  loginWithWallet: () => Promise<User>;
  loginWithEmail: (email: string, password: string, name?: string) => Promise<User>;
  chooseCustody: (mode: 'CUSTODIAL' | 'SELF', publicKey?: string) => Promise<void>;
  submitKyc: (payload: { legalName: string; cuit: string; selfieDataUrl?: string; email?: string }) => Promise<void>;
  approveToken: (listingId: string) => Promise<void>;
  claimTokens: (listingId: string) => Promise<void>;
  distributeTokens: (listingId: string) => Promise<any>;
  claimDividends: (listingId: string) => Promise<void>;
  finalizeOffering: (listingId: string) => Promise<any>;
  refundContribution: (listingId: string) => Promise<any>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  revealedSecret: null,
  loginWithGoogle: async () => {
    throw new Error('no session');
  },
  loginWithWallet: async () => {
    throw new Error('no session');
  },
  loginWithEmail: async () => {
    throw new Error('no session');
  },
  chooseCustody: async () => {},
  submitKyc: async () => {},
  approveToken: async () => {},
  claimTokens: async () => {},
  distributeTokens: async () => {},
  claimDividends: async () => {},
  finalizeOffering: async () => ({}),
  refundContribution: async () => ({}),
  refreshUser: async () => {},
  logout: () => {},
});

function persist(token: string, user: User) {
  localStorage.setItem('fc_auth_token', token);
  localStorage.setItem('fc_auth_user', JSON.stringify(user));
}

function normalize(raw: any, fallback?: Partial<User>): User {
  return {
    id: raw.id || raw.uid || fallback?.id || '',
    email: raw.email || fallback?.email || '',
    name: raw.legalName || raw.name || raw.displayName || fallback?.name || '',
    avatar: raw.avatar || raw.photoURL || fallback?.avatar || '',
    publicKey: raw.publicKey || raw.custodialWallet || '',
    custodyMode: raw.custodyMode ?? null,
    kycStatus: raw.kycStatus || 'UNREGISTERED',
    kycId: raw.kycId,
    legalName: raw.legalName,
    cuit: raw.cuit,
    selfieUrl: raw.selfieUrl,
    custodialWallet: raw.publicKey || raw.custodialWallet,
    authProvider: raw.authProvider,
    holdings: raw.holdings || [],
    trustlines: raw.trustlines || [],
    cashUsdc: typeof raw.cashUsdc === 'number' ? raw.cashUsdc : 0,
    xlmBalance: typeof raw.xlmBalance === 'number' ? raw.xlmBalance : 0,
    faucetFunded: Boolean(raw.faucetFunded),
    isAdmin: Boolean(raw.isAdmin),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const applySession = (nextToken: string, raw: any) => {
    const u = normalize(raw);
    setToken(nextToken);
    setUser(u);
    persist(nextToken, u);
  };

  const refreshUser = useCallback(async () => {
    const saved = localStorage.getItem('fc_auth_token');
    if (!saved) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${saved}` },
      });
      const data = await res.json();
      if (data.success && data.user) {
        applySession(saved, data.user);
      } else {
        localStorage.removeItem('fc_auth_token');
        localStorage.removeItem('fc_auth_user');
        setToken(null);
        setUser(null);
      }
    } catch {
      // keep local copy
    }
  }, []);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('fc_auth_token');
      const savedUser = localStorage.getItem('fc_auth_user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) refreshUser();
  }, [token, refreshUser]);

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const fbData = await loginWithFirebaseGoogle();
      const res = await fetch(`${API_BASE_URL}/api/auth/firebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: fbData.uid,
          email: fbData.email,
          displayName: fbData.displayName,
          photoURL: fbData.photoURL,
          idToken: fbData.idToken,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.user) throw new Error(data.message || 'Login falló');
      const u = normalize(data.user);
      applySession(data.token, data.user);
      return u;
    } catch (err: any) {
      if (err?.name === 'TypeError' || /failed to fetch/i.test(err?.message || '')) {
        throw new Error('No se pudo conectar al backend. Probá recargar; el API tiene que estar en el puerto 4000.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithWallet = async () => {
    setIsLoading(true);
    try {
      const { freighterLoginPayload } = await import('../lib/freighter');
      const payload = await freighterLoginPayload();
      const res = await fetch(`${API_BASE_URL}/api/auth/freighter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.user) throw new Error(data.message || 'No se pudo entrar con la wallet');
      const u = normalize(data.user);
      applySession(data.token, data.user);
      return u;
    } catch (err: any) {
      if (err?.name === 'TypeError' || /failed to fetch/i.test(err?.message || '')) {
        throw new Error('No se pudo conectar al backend. Probá recargar; el API tiene que estar en el puerto 4000.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithEmail = async (email: string, password: string, name?: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo iniciar sesión');
      const u = normalize(data.user);
      applySession(data.token, data.user);
      return u;
    } catch (err: any) {
      if (err?.name === 'TypeError' || /failed to fetch/i.test(err?.message || '')) {
        throw new Error('No se pudo conectar al backend. Probá recargar; el API tiene que estar en el puerto 4000.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const chooseCustody = async (mode: 'CUSTODIAL' | 'SELF', publicKey?: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/auth/wallet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode, publicKey }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo guardar la custodia');
    if (data.secretOnce) setRevealedSecret(data.secretOnce);
    applySession(token, data.user);
  };

  const submitKyc = async (payload: { legalName: string; cuit: string; selfieDataUrl?: string; email?: string }) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/kyc/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo enviar el KYC');
    applySession(token, data.user);
  };

  const approveToken = async (listingId: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/trustline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo aprobar el token');
    applySession(token, data.data);
  };

  const claimTokens = async (listingId: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron reclamar los tokens');
    applySession(token, data.data);
  };

  const distributeTokens = async (listingId: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/distribute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron enviar los tokens on-chain');
    await refreshUser();
    return data.data;
  };

  const finalizeOffering = async (listingId: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo finalizar la licitación');
    return data.data;
  };

  const refundContribution = async (listingId: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo reembolsar');
    if (data.data?.user) applySession(token, data.data.user);
    return data.data;
  };

  const claimDividends = async (listingId: string) => {
    if (!token) throw new Error('Iniciá sesión');
    const res = await fetch(`${API_BASE_URL}/api/listings/${listingId}/dividends/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo cobrar el dividendo');
    applySession(token, data.data.user);
  };

  const logout = () => {
    logoutFromFirebase();
    setUser(null);
    setToken(null);
    setRevealedSecret(null);
    localStorage.removeItem('fc_auth_token');
    localStorage.removeItem('fc_auth_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        revealedSecret,
        loginWithGoogle,
        loginWithWallet,
        loginWithEmail,
        chooseCustody,
        submitKyc,
        approveToken,
        claimTokens,
        distributeTokens,
        claimDividends,
        finalizeOffering,
        refundContribution,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function nextOnboardingPath(user: User | null) {
  if (!user) return '/login';
  if (user.isAdmin) return '/dashboard';
  if (!user.custodyMode) return '/onboarding/wallet';
  if (user.kycStatus === 'UNREGISTERED') return '/onboarding/kyc';
  if (user.kycStatus !== 'APPROVED') return '/onboarding/pending';
  return '/dashboard';
}

export function afterAuthPath(user: User, nextParam?: string | null) {
  if (user.isAdmin) return nextParam || '/admin/kyc';
  const dest = nextOnboardingPath(user);
  if (nextParam && user.kycStatus === 'APPROVED') return nextParam;
  return dest;
}
