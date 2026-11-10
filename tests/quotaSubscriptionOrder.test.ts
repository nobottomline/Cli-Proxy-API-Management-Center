import { describe, expect, test } from 'bun:test';
import { sortQuotaEntries, paginate, type QuotaFileEntry } from '@/features/quota/logic';
import { subscriptionRank } from '@/features/quota/subscriptionOrder';
import { resolveClaudePlanType } from '@/features/quota/providers/claude/data';
import type { ClaudeQuotaState } from '@/types';
import en from '@/i18n/locales/en.json';

const plans: Record<string, string | null> = {
  Pro: 'plan_pro',
  Max: 'plan_max5',
  Ultra: 'plan_max20',
  Unknown: null,
  'Another Ultra': 'plan_max20',
  'Generic Max': 'plan_max',
};
const entries = Object.keys(plans).map((name): QuotaFileEntry => ({
  file: { name, type: 'claude', priority: name === 'Pro' ? 100 : 0 },
  type: 'claude',
}));
const rank = (entry: QuotaFileEntry) =>
  subscriptionRank(entry, {
    status: 'success',
    windows: [],
    planType: plans[entry.file.name],
  } satisfies ClaudeQuotaState);

describe('subscription display order', () => {
  test('Ultra precedes Max and Pro, ties are stable, and routing priorities stay intact', () => {
    const before = structuredClone(entries);
    const sorted = sortQuotaEntries(entries, 'default', () => null, rank);
    expect(sorted.map(({ file }) => file.name)).toEqual([
      'Ultra',
      'Another Ultra',
      'Max',
      'Generic Max',
      'Pro',
      'Unknown',
    ]);
    expect(paginate(sorted, 1, 2).pageItems.map(({ file }) => file.name)).toEqual([
      'Ultra',
      'Another Ultra',
    ]);
    expect(entries).toEqual(before);
  });

  test('the recovery sort still takes precedence when explicitly selected', () => {
    const sorted = sortQuotaEntries(
      entries,
      'soonest',
      (entry) => (entry.file.name === 'Pro' ? 1 : 2),
      rank
    );
    expect(sorted[0].file.name).toBe('Pro');
  });

  test('the legacy Max 20x API tier is displayed and sorted as Ultra', () => {
    const planType = resolveClaudePlanType({
      account: { has_claude_max: true },
      organization: { rate_limit_tier: 'default_claude_max_20x' },
    });
    expect(planType).toBe('plan_max20');
    expect(en.claude_quota[planType as keyof typeof en.claude_quota]).toBe('Ultra');
    expect(rank(entries[2])).toBeGreaterThan(rank(entries[1]));
  });

  test('unknown data and filenames never fabricate a subscription', () => {
    const entry: QuotaFileEntry = { type: 'claude', file: { name: 'ultra@example.invalid' } };
    expect(subscriptionRank(entry)).toBe(0);
    expect(subscriptionRank(entry, { status: 'idle', windows: [] })).toBe(0);
  });
});
