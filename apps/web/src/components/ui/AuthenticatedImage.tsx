import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { container } from '@/core/container';

interface AuthenticatedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** API path (or absolute URL) of an image that requires the session token. */
  path: string;
  fallback?: ReactNode;
}

/**
 * `<img src>` cannot send `Authorization`, so protected images (KYC selfies)
 * are fetched with the session token and shown through a short-lived object URL.
 */
export default function AuthenticatedImage({ path, fallback = null, alt = '', ...img }: AuthenticatedImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    setFailed(false);
    container.http
      .blob(path)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [path]);

  if (failed || !url) return <>{fallback}</>;
  return <img {...img} alt={alt} src={url} decoding="async" />;
}
