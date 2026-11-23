import { RotateCcw } from 'lucide-react';
import { ChecklistItem } from '@/components/ui/kit';

export interface HeroFact {
  title: string;
  subtitle: string;
  /** Shown as a navy chip on the right instead of a check. */
  badge?: string;
}

/**
 * Three facts under the hero, in the shape of the reference's task rows.
 * Static (rendered on the server, no client JS).
 */
export default function HeroFacts({ facts }: { facts: HeroFact[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {facts.map((f) => (
        <li key={f.title} className="min-w-0">
          <ChecklistItem
            done={!f.badge}
            icon={f.badge ? <RotateCcw className="h-4 w-4" /> : undefined}
            title={f.title}
            subtitle={f.subtitle}
            trailing={f.badge ? <span className="chip-navy">{f.badge}</span> : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
