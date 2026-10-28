import type { AuthFileItem, ClaudeQuotaState, ClaudeQuotaWindow } from '@/types';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';

export const LEDGER_COLUMNS = ['seven-day', 'five-hour', 'seven-day-fable'] as const;

export function remainingPercent(window: ClaudeQuotaWindow | undefined): number | null {
  const used = window?.usedPercent;
  return typeof used === 'number' && Number.isFinite(used)
    ? 100 - Math.max(0, Math.min(100, used))
    : null;
}

export function ledgerIdentity(file: AuthFileItem): string {
  const label = typeof file.label === 'string' ? file.label.trim() : '';
  return label && label !== file.name ? label : deriveAuthFileIdentity(file).primary;
}

/** Availability needs every exhausted shared pool to recover, not the first one. */
export function sharedBlockedUntil(
  quota: ClaudeQuotaState | undefined,
  now: number
): number | null {
  const blocked = (quota?.windows ?? []).filter(
    (window) => ['seven-day', 'five-hour'].includes(window.id) && remainingPercent(window) === 0
  );
  if (!blocked.length) return null;
  const resets = blocked.map((window) => window.resetAtMs);
  if (resets.some((at) => typeof at !== 'number' || !Number.isFinite(at))) return null;
  const last = Math.max(...(resets as number[]));
  return last > now ? last : null;
}

/** Account-percent sum, never a claim that different subscriptions share a budget. */
export function aggregateRemaining(quotas: (ClaudeQuotaState | undefined)[], id: string) {
  const values = quotas.map((quota) =>
    remainingPercent(quota?.windows?.find((window) => window.id === id))
  );
  const known = values.filter((value): value is number => value !== null);
  return {
    value: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
    known: known.length,
    total: quotas.length,
  };
}
