import type { AnchorHTMLAttributes } from 'react';

/** Link to another site: new tab, no opener, no referrer leak. */
export default function ExternalLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}
