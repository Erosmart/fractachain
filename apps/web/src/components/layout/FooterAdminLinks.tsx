import { withIsland } from '@/components/island/withIsland';
import { useSession } from '@/hooks/useSession';
import { useI18n } from '@/hooks/useI18n';

/** Admin column of the footer: the only session-dependent part of it. */
function FooterAdminLinks() {
  const { user } = useSession();
  const { t } = useI18n();
  if (!user?.isAdmin) return null;
  return (
    <div>
      <h4 className="font-display font-extrabold text-black text-xs tracking-wider uppercase mb-3">Admin</h4>
      <ul className="space-y-2 text-sm">
        <li>
          <a href="/admin/issuance" className="hover:text-black">
            {t('nav.issuance')}
          </a>
        </li>
        <li>
          <a href="/admin/kyc" className="hover:text-black">
            {t('nav.kyc')}
          </a>
        </li>
        <li>
          <a href="/admin/audit" className="hover:text-black">
            {t('admAudit.nav')}
          </a>
        </li>
      </ul>
    </div>
  );
}

export default withIsland(FooterAdminLinks);
