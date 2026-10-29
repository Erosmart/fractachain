import { useState, type ReactNode } from 'react';

interface BrandLogoProps {
  slug: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}

/** Partner / ticker logo from `/public/brands`, with a fallback if the file is missing. */
export default function BrandLogo({
  slug,
  alt,
  className = 'h-10 w-auto max-h-10 max-w-[7.5rem] object-contain object-left',
  fallback = null,
}: BrandLogoProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={`/brands/${slug}.png`}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
