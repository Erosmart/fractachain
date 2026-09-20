'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, afterAuthPath } from '../../context/AuthContext';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import WalletAddress from '../../components/WalletAddress';

export default function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loginWithEmail, isLoading, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const goNext = () => {
    if (!user) return;
    router.push(afterAuthPath(user, params.get('next')));
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const u = await loginWithEmail(email, password, name);
      router.push(afterAuthPath(u, params.get('next')));
    } catch (err: any) {
      setError(err.message || 'No se pudo entrar');
    }
  };

  if (user) {
    return (
      <div className="max-w-md mx-auto py-16 space-y-6 text-center">
        <h1 className="text-2xl font-extrabold font-display">Ya estás adentro</h1>
        <p className="text-neutral-600">{user.email}</p>
        <div className="p-4 rounded-2xl crystal-card text-left space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-display font-bold">Tu wallet</p>
          <WalletAddress address={user.publicKey} />
        </div>
        <button type="button" onClick={goNext} className="px-6 py-3 rounded-2xl bg-black text-white font-display font-bold">
          Continuar
        </button>
        <button type="button" onClick={logout} className="block mx-auto text-sm text-neutral-500">
          Cerrar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold font-display">Ingresar o crear cuenta</h1>
        <p className="text-neutral-600">
          Es el mismo formulario. Si el email no existe, se crea la cuenta y después pedimos custodia y KYC.
        </p>
      </div>

      <div className="p-6 rounded-3xl crystal-card space-y-5">
        <GoogleLoginButton
          label="Continuar con Google"
          className="w-full py-3"
          onSuccess={(u) => router.push(afterAuthPath(u as any, params.get('next')))}
        />
        <p className="text-center text-xs text-neutral-500">o con email</p>
        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="text"
            placeholder="Nombre (obligatorio la primera vez)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
          />
          <input
            required
            minLength={6}
            type="password"
            placeholder="Contraseña (mín. 6)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white"
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold"
          >
            {isLoading ? 'Entrando…' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
