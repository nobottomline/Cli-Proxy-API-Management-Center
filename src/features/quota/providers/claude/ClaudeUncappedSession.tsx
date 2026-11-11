import { useTranslation } from 'react-i18next';
import styles from './ClaudeUncappedSession.module.scss';

/** No percentage meter: an absent session cap is not a full allowance. */
export function ClaudeUncappedSession() {
  const { t } = useTranslation();
  return (
    <div className={styles.allowance} role="group" aria-label={t('claude_quota.session_uncapped')}>
      <div className={styles.heading}>
        <span>{t('claude_quota.five_hour')}</span>
        <strong aria-hidden="true">∞</strong>
      </div>
      <div className={styles.track} aria-hidden="true" />
      <div className={styles.note}>
        <span>{t('claude_quota.session_uncapped')}</span>
        <span>{t('claude_quota.weekly_limits_apply')}</span>
      </div>
    </div>
  );
}
