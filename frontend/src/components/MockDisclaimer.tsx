import Link from 'next/link';

export default function MockDisclaimer({
  product,
}: {
  product: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-display font-bold">Maqueta — no pega en Stellar</p>
      <p className="mt-1 text-amber-900/90">
        {product} está diseñado en contrato Soroban, pero esta pantalla es un simulador.
        El flujo vivo de la hackathon es la{' '}
        <Link href="/market" className="font-bold underline">
          licitación
        </Link>
        : login, KYC, wallet testnet y aporte en USDC.
      </p>
    </div>
  );
}
