import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useWindows } from './useWindowStart';
import styles from './WindowStart.module.scss';

const enabled = import.meta.env.VITE_SESSION_WINDOW_CONTROLS !== 'false';

function Play() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 2.8c0-.6.7-1 1.2-.6l8 5a.9.9 0 0 1 0 1.6l-8 5c-.5.4-1.2 0-1.2-.6Z"
      />
    </svg>
  );
}

export function WindowStartButton({
  index,
  disabled = false,
}: {
  index: string | number | null | undefined;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { busy, loading, accounts, start } = useWindows();
  const account = accounts.find((item) => item.authIndex === String(index));
  const result = account?.result;
  const working =
    result && ['queued', 'checking', 'sending', 'confirming'].includes(result.state) && busy;
  const done = result && ['started', 'active'].includes(result.state);
  const failed = result && ['error', 'unconfirmed', 'interrupted'].includes(result.state);
  const details = [t('window_start.one')];
  if (result) details.push(t(`window_start.states.${result.state}`));
  if (result?.resetsAt)
    details.push(
      `${t('window_start.reset')}: ${new Date(result.resetsAt).toLocaleString(i18n.language)}`
    );
  if (result?.usage)
    details.push(
      t('window_start.tokens', {
        input: result.usage.inputTokens,
        output: result.usage.outputTokens,
      })
    );
  if (result?.httpStatus) details.push(`HTTP ${result.httpStatus}`);
  return enabled ? (
    <button
      type="button"
      className={styles.single}
      disabled={disabled || busy || loading || index == null}
      onClick={() => void start(String(index))}
      aria-label={t('window_start.one')}
      title={details.join('\n')}
    >
      {working ? (
        <LoadingSpinner size={12} />
      ) : done ? (
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m3 8 3 3 7-7"
          />
        </svg>
      ) : failed ? (
        <span aria-hidden="true">!</span>
      ) : (
        <Play />
      )}
    </button>
  ) : null;
}

export function WindowStartControls({ compact = false }: { compact?: boolean } = {}) {
  const { t } = useTranslation();
  const { busy, loading, error, accounts, refresh, start } = useWindows();
  const wasBusy = useRef(false);
  useEffect(() => {
    if (enabled) void refresh();
  }, [refresh]);
  useEffect(() => {
    if (wasBusy.current && !busy)
      useNotificationStore.getState().showNotification(t('window_start.complete'), 'info');
    wasBusy.current = busy;
    if (!enabled || !busy) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [busy, refresh, t]);
  return enabled ? (
    <button
      type="button"
      className={`${styles.all} ${compact ? styles.compact : ''}`}
      disabled={busy || loading || (!error && !accounts.length)}
      onClick={() => (error ? void refresh() : void start())}
      title={error ? t('window_start.error') : t('window_start.hint')}
    >
      {busy || loading ? <LoadingSpinner size={12} /> : <Play />}
      <span className={styles.label}>
        {' '}
        {error
          ? t('window_start.refresh')
          : busy || loading
            ? t('window_start.running')
            : t('window_start.all')}
      </span>
    </button>
  ) : null;
}
