import { Notice } from '@/components/ui/kit';
import type { ActionMessage as Message } from '../hooks/usePortfolio';

/** Result of the last action, announced to screen readers (the region is always mounted). */
export function ActionMessage({ message, className = '' }: { message: Message | null; className?: string }) {
  return (
    <div aria-live="polite" className={className}>
      {message && <Notice tone={message.tone === 'good' ? 'good' : 'bad'}>{message.text}</Notice>}
    </div>
  );
}
