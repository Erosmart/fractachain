'use client';

import Link from 'next/link';

export default function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 sm:gap-2.5 min-w-0 group" aria-label="Fractachain">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        className="logo-lockup h-8 sm:h-9 w-auto max-w-[6.5rem] sm:max-w-[8rem] object-contain object-left shrink-0"
      />
      {!compact && (
        <span className="font-display text-base sm:text-[1.45rem] font-extrabold tracking-[-0.04em] text-black leading-none whitespace-nowrap max-[379px]:hidden">
          Fractachain
        </span>
      )}
    </Link>
  );
}
