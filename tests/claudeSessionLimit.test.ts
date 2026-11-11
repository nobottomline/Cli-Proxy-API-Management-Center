import { afterEach, describe, expect, test } from 'bun:test';
import { resolveClaudeFiveHourLimit } from '@/features/quota/providers/claude/sessionLimit';
import { CLAUDE_CONFIG } from '@/features/quota/providers/claude/data';
import { apiCallApi } from '@/services/api';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { ClaudeUsagePayload } from '@/types';
import type { TFunction } from 'i18next';

const uncapped: ClaudeUsagePayload = {
  five_hour: null,
  seven_day: { utilization: 25, resets_at: '2099-01-01T00:00:00Z' },
  limits: [{ kind: 'weekly_all', percent: 25 }],
};
const originalRequest = apiCallApi.request;
afterEach(() => {
  apiCallApi.request = originalRequest;
  useQuotaStore.getState().clearQuotaCache();
});

describe('Claude session cap evidence', () => {
  test('explicit null on Ultra with readable weekly usage and no session limit is uncapped', () => {
    expect(resolveClaudeFiveHourLimit(uncapped, 'plan_max20')).toBe('uncapped');
  });

  test('a real session wins over the Ultra plan name, including a completely unused window', () => {
    expect(
      resolveClaudeFiveHourLimit(
        { ...uncapped, five_hour: { utilization: 0, resets_at: null } },
        'plan_max20'
      )
    ).toBe('limited');
    expect(
      resolveClaudeFiveHourLimit(
        { ...uncapped, limits: [{ kind: 'session', percent: 0 }] },
        'plan_max20'
      )
    ).toBe('limited');
  });

  test.each(['plan_pro', 'plan_max', 'plan_max5', 'plan_team', null])(
    'null does not mean unlimited on %s',
    (plan) => {
      expect(resolveClaudeFiveHourLimit(uncapped, plan)).toBe('unknown');
    }
  );

  test.each([
    {},
    { ...uncapped, five_hour: undefined },
    { ...uncapped, seven_day: null },
    { ...uncapped, limits: undefined },
    { ...uncapped, limits: [{ kind: 42 }] },
    { ...uncapped, five_hour: {} },
    { ...uncapped, seven_day: { utilization: NaN } },
  ])('missing, malformed and contradictory evidence stays unknown: %j', (payload) => {
    expect(resolveClaudeFiveHourLimit(payload as ClaudeUsagePayload, 'plan_max20')).toBe('unknown');
  });

  test('the real provider fetch/store pipeline preserves evidence through a failed refresh', async () => {
    apiCallApi.request = async (request) => ({
      statusCode: 200,
      header: {},
      bodyText: '',
      body: request.url.endsWith('/profile')
        ? {
            account: { has_claude_max: true },
            organization: { rate_limit_tier: 'default_claude_max_20x' },
          }
        : uncapped,
    });
    const data = await CLAUDE_CONFIG.fetchQuota(
      { name: 'synthetic.json', authIndex: 'synthetic' },
      ((key: string) => key) as TFunction
    );
    expect(data.fiveHourLimit).toBe('uncapped');
    expect(data.windows.some((window) => window.id === 'five-hour')).toBe(false);
    useQuotaStore.getState().setClaudeQuota({ synthetic: CLAUDE_CONFIG.buildSuccessState(data) });
    useQuotaStore.getState().setClaudeQuota({ synthetic: CLAUDE_CONFIG.buildLoadingState() });
    expect(useQuotaStore.getState().claudeQuota.synthetic.fiveHourLimit).toBe('uncapped');
    useQuotaStore
      .getState()
      .setClaudeQuota({ synthetic: CLAUDE_CONFIG.buildErrorState('synthetic failure', 503) });
    expect(useQuotaStore.getState().claudeQuota.synthetic.fiveHourLimit).toBe('uncapped');
    expect(useQuotaStore.getState().claudeQuota.synthetic.stale).toBe(true);
  });
});
