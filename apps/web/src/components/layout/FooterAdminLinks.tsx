import { withIsland } from '@/components/island/withIsland';
import { useSession } from '@/hooks/useSession';
import { useI18n } from '@/hooks/useI18n';

/** Console column of the footer: the only session-dependent part of it. */
function FooterAdminLinks() {
  const { user } = useSession();
  const { t } = useI18n();
  if (!user?.isAdmin) return null;
  const links = [
    { href: '/admin', label: t('admin.nav.overview') },
    { href: '/admin/issuance', label: t('admin.nav.issuance') },
    { href: '/admin/kyc', label: t('admin.nav.kyc') },
    { href: '/admin/audit', label: t('admin.nav.audit') },
  ];
  return (
    <div>
      <h2 className="mb-3 text-xs font-medium text-muted">{t('landing.footer.console')}</h2>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default withIsland(FooterAdminLinks);
