import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { container } from '@/core/container';

interface AuthenticatedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** API path of an image only the signed-in owner or an admin may see (KYC selfies). */
  path: string;
  fallback?: ReactNode;
}

/**
 * Image behind the session. The API is same-origin and the session is a
 * cookie, so a plain `<img>` already carries the credential — no blob/object
 * URL dance. Falls back when the API refuses (401/403/404).
 */
export default function AuthenticatedImage({
  path,
  fallback = null,
  alt = '',
  ...img
}: AuthenticatedImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  if (failed) return <>{fallback}</>;
  return (
    <img
      {...img}
      alt={alt}
      src={container.http.url(path)}
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
