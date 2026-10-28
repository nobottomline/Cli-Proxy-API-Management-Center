import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import type { ClaudeQuotaState, ClaudeQuotaWindow, ResolvedTheme } from '@/types';
import { useNow } from '@/hooks/useNow';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { WindowStartButton } from '@/features/windowStart/WindowStart';
import { formatRelativeInstant, formatInstantShort } from '@/utils/quota';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import {
  aggregateRemaining,
  ledgerIdentity,
  LEDGER_COLUMNS,
  remainingPercent,
  sharedBlockedUntil,
} from '../ledgerModel';
import { QuotaCard } from './QuotaCard';
import type { QuotaFileEntry } from '../logic';
import { type QuotaCardState } from '../providers';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { ClaudeQuotaBody } from '../providers/claude/ClaudeQuotaBody';
import { ClaudeResetGrantDetails } from '../providers/claude/ClaudeResetGrantDetails';
import { bindQuotaClasses } from '../types';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaLedger.module.scss';

const bodyClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

export interface QuotaLedgerProps {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  disabled: boolean;
  refreshing: boolean;
  resettingName: string | null;
  onRefresh: (entry: QuotaFileEntry) => void;
  onReset: (entry: QuotaFileEntry) => void;
}

export function QuotaLedger(props: QuotaLedgerProps) {
  const { t } = useTranslation();
  const groups = new Map<string, QuotaFileEntry[]>();
  props.entries.forEach((entry) =>
    groups.set(entry.type, [...(groups.get(entry.type) ?? []), entry])
  );
  return (
    <div className={styles.ledger}>
      {Array.from(groups, ([type, entries]) => (
        <section key={type} aria-label={getTypeLabel(t, type)} className={styles.group}>
          <ProviderSummary
            entries={entries}
            quotaFor={props.quotaFor}
            resolvedTheme={props.resolvedTheme}
          />
          {entries.map((entry) =>
            entry.type === 'claude' ? (
              <ClaudeLedgerRow
                key={getQuotaCacheKey(entry.file)}
                entry={entry}
                quota={props.quotaFor(entry) as ClaudeQuotaState | undefined}
                disabled={props.disabled || !!entry.file.disabled}
                refreshing={props.refreshing}
                onRefresh={() => props.onRefresh(entry)}
                resolvedTheme={props.resolvedTheme}
              />
            ) : (
              <QuotaCard
                key={`${entry.type}:${getQuotaCacheKey(entry.file)}`}
                entry={entry}
                quota={props.quotaFor(entry)}
                resolvedTheme={props.resolvedTheme}
                canRefresh={!props.disabled && !entry.file.disabled}
                resetting={props.resettingName === getQuotaCacheKey(entry.file)}
                onRefresh={() => props.onRefresh(entry)}
                onReset={() => props.onReset(entry)}
              />
            )
          )}
        </section>
      ))}
    </div>
  );
}

function ProviderSummary({
  entries,
  quotaFor,
  resolvedTheme,
}: Pick<QuotaLedgerProps, 'entries' | 'quotaFor' | 'resolvedTheme'>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const type = entries[0].type;
  const label = getTypeLabel(t, type);
  const icon = getAuthFileIcon(type, resolvedTheme);
  const aggregate = aggregateRemaining(
    type === 'claude'
      ? entries.map((entry) => quotaFor(entry) as ClaudeQuotaState | undefined)
      : [],
    'seven-day-fable'
  );
  return (
    <div className={styles.summary}>
      <div className={styles.summaryHead}>
        <span className={styles.provider}>
          {icon && <img src={icon} alt="" />}
          <strong>{label}</strong>
        </span>
        <span>{t('quota_ledger.credentials', { count: entries.length })}</span>
      </div>
      {type === 'claude' && (
        <>
          <div className={styles.summaryTotal}>
            <span title={t('quota_ledger.aggregate_hint')}>
              {t('claude_quota.seven_day_fable')}{' '}
              <strong>{aggregate.value === null ? '--' : `${Math.round(aggregate.value)}%`}</strong>
              {aggregate.known > 0 && aggregate.known < aggregate.total && (
                <small>
                  {' '}
                  · {aggregate.known}/{aggregate.total}
                </small>
              )}
            </span>
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {t(expanded ? 'quota_ledger.hide' : 'quota_ledger.show')}
            </button>
          </div>
          {expanded && (
            <div className={styles.summaryDetails}>
              <p>{t('quota_ledger.aggregate_hint')}</p>
              {entries.map((entry) => {
                const quota = quotaFor(entry) as ClaudeQuotaState | undefined;
                const percent = remainingPercent(
                  quota?.windows.find((window) => window.id === 'seven-day-fable')
                );
                return (
                  <div key={getQuotaCacheKey(entry.file)}>
                    <span>{ledgerIdentity(entry.file)}</span>
                    <span>{percent === null ? '--' : `${Math.round(percent)}%`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClaudeLedgerRow({
  entry,
  quota,
  disabled,
  refreshing,
  onRefresh,
  resolvedTheme,
}: {
  entry: QuotaFileEntry;
  quota?: ClaudeQuotaState;
  disabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  resolvedTheme: ResolvedTheme;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const loading = quota?.status === 'loading';
  const name = ledgerIdentity(entry.file);
  const reset = useClaudeResetGrants(
    entry.file,
    quota?.status === 'success',
    disabled || loading || refreshing,
    quota,
    onRefresh
  );
  const blockedUntil = sharedBlockedUntil(quota, now);
  const failed = quota?.status === 'error' || quota?.stale;
  const observed = quota?.observedAt ? Date.parse(quota.observedAt) : NaN;
  const icon = getAuthFileIcon('claude', resolvedTheme);
  return (
    <article
      className={`${styles.row} ${blockedUntil ? styles.blocked : ''}`}
      aria-label={name}
      aria-busy={loading}
    >
      <div className={styles.identity}>
        <h2>
          {icon && <img src={icon} alt="" />}
          <span title={name}>{name}</span>
        </h2>
        <div className={styles.status}>
          <span>Claude</span>
          {blockedUntil && (
            <span className={styles.back}>
              {' '}
              ·{' '}
              {t('quota_ledger.back', {
                time: formatRelativeInstant(blockedUntil, now, i18n.resolvedLanguage),
              })}
            </span>
          )}
        </div>
        <div className={styles.lastSeen}>
          {Number.isFinite(observed)
            ? t('quota_ledger.last_checked', {
                time: new Date(observed).toLocaleString(i18n.resolvedLanguage, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }),
              })
            : t(loading ? 'quota_ledger.loading' : 'quota_ledger.not_checked')}
        </div>
        {failed && (
          <span className={styles.error} role="status" title={quota?.error}>
            {t(quota?.stale ? 'quota_ledger.stale' : 'quota_ledger.load_failed')}
          </span>
        )}
      </div>
      <div className={styles.meters}>
        {LEDGER_COLUMNS.map((id) => (
          <LedgerMeter
            key={id}
            id={id}
            window={quota?.windows.find((window) => window.id === id)}
            now={now}
            loading={loading}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <div className={styles.resets}>
          {t('quota_ledger.resets_remaining')} <strong>{reset.count ?? '--'}</strong>
        </div>
        <div className={styles.actionButtons}>
          <button
            type="button"
            disabled={reset.blocked || refreshing}
            onClick={reset.confirm}
            title={
              reset.message
                ? t(`claude_reset.${reset.message}`)
                : t('claude_reset.confirm_text', { name })
            }
          >
            <IconRefreshCw size={14} className={reset.busy ? styles.spinning : undefined} />
            {t('quota_ledger.reset_limits')}
          </button>
          <button type="button" disabled={disabled || loading || refreshing} onClick={onRefresh}>
            <IconRefreshCw size={14} className={loading ? styles.spinning : undefined} />
            {t('quota_ledger.refresh_quota')}
          </button>
          <WindowStartButton index={entry.file.authIndex} disabled={disabled || loading} />
          {quota?.windows.length ? (
            <details className={styles.details}>
              <summary
                aria-label={t('quota_ledger.more_details')}
                title={t('quota_ledger.more_details')}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="3" cy="8" r="1.25" fill="currentColor" />
                  <circle cx="8" cy="8" r="1.25" fill="currentColor" />
                  <circle cx="13" cy="8" r="1.25" fill="currentColor" />
                </svg>
              </summary>
              <div className={styles.detailsBody}>
                <ClaudeQuotaBody quota={quota} classes={bodyClasses} />
                <ClaudeResetGrantDetails grants={reset.grants} classes={bodyClasses} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LedgerMeter({
  id,
  window,
  now,
  loading,
}: {
  id: string;
  window?: ClaudeQuotaWindow;
  now: number;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const percent = remainingPercent(window);
  const key =
    id === 'five-hour' ? 'five_hour' : id === 'seven-day' ? 'seven_day' : 'seven_day_fable';
  const at = window?.resetAtMs;
  const reset = typeof at === 'number' && Number.isFinite(at) ? at : null;
  return (
    <div className={styles.meter}>
      <div className={styles.meterLabel}>
        <span>{t(`claude_quota.${key}`)}</span>
        <strong>{percent === null ? '--' : `${Math.round(percent)}%`}</strong>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={t(`claude_quota.${key}`)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={percent === null ? t('quota_ledger.unknown') : `${Math.round(percent)}%`}
      >
        <div
          className={`${styles.fill} ${percent !== null && percent < 10 ? styles.low : ''}`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <div className={styles.resetTime}>
        {reset !== null ? (
          <>
            <span>{formatRelativeInstant(reset, now, i18n.resolvedLanguage)}</span>
            <span> · {formatInstantShort(reset)}</span>
          </>
        ) : (
          t(
            loading
              ? 'quota_ledger.loading'
              : window
                ? 'quota_ledger.no_reset'
                : 'quota_ledger.not_reported'
          )
        )}
      </div>
    </div>
  );
}
