import { Fragment, type ReactNode } from 'react';

/**
 * Renders a translated sentence with `{key}` placeholders replaced by nodes
 * (links inside checkbox labels: "Acepto los {terms} y la {privacy}.").
 */
export default function LinkedText({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  const chunks = text.split(/(\{\w+\})/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        const key = /^\{(\w+)\}$/.exec(chunk)?.[1];
        return <Fragment key={i}>{key && key in parts ? parts[key] : chunk}</Fragment>;
      })}
    </>
  );
}

/** A link to a legal document that opens in a new tab and says so to screen readers. */
export function DocLink({ href, children, newTab }: { href: string; children: ReactNode; newTab: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="font-medium text-ink underline underline-offset-2 hover:text-sky-strong"
    >
      {children}
      <span className="sr-only"> {newTab}</span>
    </a>
  );
}
