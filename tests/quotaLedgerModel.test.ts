import { describe, expect, test } from 'bun:test';
import {
  aggregateRemaining,
  ledgerIdentity,
  remainingPercent,
  sharedBlockedUntil,
} from '@/features/quota/ledgerModel';
import { filterEntriesBySearch } from '@/features/quota/logic';
import type { ClaudeQuotaState, ClaudeQuotaWindow } from '@/types';

const window = (id: string, used: number | null, reset?: number): ClaudeQuotaWindow => ({
  id,
  label: id,
  usedPercent: used,
  resetLabel: '',
  resetAtMs: reset,
});
const quota = (...windows: ClaudeQuotaWindow[]): ClaudeQuotaState => ({
  status: 'success',
  windows,
});

describe('ledger provider observations', () => {
  test('public labels can be searched without searching credential fields', () => {
    const entries = [
      {
        type: 'claude' as const,
        file: { name: 'file.json', label: 'Research', account: 'private-synthetic-key' },
      },
    ];
    expect(filterEntriesBySearch(entries, 'research')).toHaveLength(1);
    expect(filterEntriesBySearch(entries, 'private-synthetic-key')).toHaveLength(0);
  });

  test('shows remaining allowance and does not fabricate full unknown meters', () => {
    expect(remainingPercent(window('five-hour', 14))).toBe(86);
    expect(remainingPercent(window('five-hour', -8))).toBe(100);
    expect(remainingPercent(window('five-hour', 104))).toBe(0);
    expect(remainingPercent(window('five-hour', null))).toBeNull();
    expect(remainingPercent(window('five-hour', NaN))).toBeNull();
    expect(remainingPercent(undefined)).toBeNull();
  });
  test('a blocked account recovers after both shared limits, excluding model-only pools', () => {
    const state = quota(
      window('five-hour', 100, 2000),
      window('seven-day', 100, 6000),
      window('seven-day-fable', 100, 9000)
    );
    expect(sharedBlockedUntil(state, 1000)).toBe(6000);
    expect(sharedBlockedUntil(quota(window('seven-day-fable', 100, 9000)), 1000)).toBeNull();
    expect(sharedBlockedUntil(quota(window('seven-day', 100)), 1000)).toBeNull();
    expect(sharedBlockedUntil(state, 10000)).toBeNull();
  });
  test('aggregate distinguishes partial observations from a complete 600 percent sum', () => {
    const full = quota(window('seven-day-fable', 0));
    expect(aggregateRemaining(Array(6).fill(full), 'seven-day-fable')).toEqual({
      value: 600,
      known: 6,
      total: 6,
    });
    expect(aggregateRemaining([full, undefined], 'seven-day-fable')).toEqual({
      value: 100,
      known: 1,
      total: 2,
    });
    expect(aggregateRemaining([undefined], 'seven-day-fable')).toEqual({
      value: null,
      known: 0,
      total: 1,
    });
  });
  test('identity uses public labels or email and never account credentials', () => {
    expect(
      ledgerIdentity({
        name: 'file.json',
        label: 'Research',
        email: 'research@example.invalid',
        account: 'private-synthetic-key',
      })
    ).toBe('Research');
    expect(
      ledgerIdentity({
        name: 'file.json',
        email: 'research@example.invalid',
        account: 'private-synthetic-key',
      })
    ).toBe('research@example.invalid');
    expect(ledgerIdentity({ name: 'file.json', account: 'private-synthetic-key' })).toBe('file');
  });
});
