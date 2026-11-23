import { withIsland } from '@/components/island/withIsland';
import { PillTabs } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { SECTIONS, type SectionName } from './navigation';

/**
 * Second-level pills for Mercado, Cuenta and Consola. Rendered by the page
 * (`<SectionNav section="markets" active="stocks" />`), so it is part of
 * the server HTML.
 */
function SectionNav({
  section,
  active,
  className = '',
}: {
  section: SectionName;
  active: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <PillTabs
      label={t(
        `shell.tabs.${section === 'markets' ? 'markets' : section === 'account' ? 'account' : 'console'}`,
      )}
      active={active}
      className={className}
      items={SECTIONS[section].map((s) => ({ key: s.key, href: s.href, label: t(s.label) }))}
    />
  );
}

export default withIsland(SectionNav);
