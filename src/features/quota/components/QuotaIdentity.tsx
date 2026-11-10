import { useTranslation } from 'react-i18next';
import styles from './QuotaIdentity.module.scss';

/** Hidden identities never enter text, tooltips, or the accessibility tree. */
export function QuotaIdentity({
  name,
  hidden = false,
  className = '',
}: {
  name: string;
  hidden?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t('quota_management.email_hidden');
  return hidden ? (
    <span className={`${className} ${styles.mask}`} title={label}>
      <span className={styles.srOnly}>{label}</span>
      <span className={styles.placeholder} aria-hidden="true">
        ••••••@••••••
      </span>
    </span>
  ) : (
    <span className={className} title={name}>
      {name}
    </span>
  );
}
