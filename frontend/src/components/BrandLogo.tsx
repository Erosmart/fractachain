'use client';

import { useState, type ReactNode } from 'react';

export default function BrandLogo({
  slug,
  alt,
  className = 'h-10 w-auto max-h-10 max-w-[7.5rem] object-contain object-left',
  fallback = null,
}: {
  slug: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brands/${slug}.png`}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
