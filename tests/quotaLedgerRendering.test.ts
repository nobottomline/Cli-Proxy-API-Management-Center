import { describe, expect, test, mock } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/locales/en.json';
import { QUOTA_CLASS_KEYS } from '@/features/quota/types';

// Bun imports SCSS as source text; Vite supplies class maps in production.
mock.module('../src/features/quota/components/QuotaBody.module.scss', () => ({
  default: Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
}));
const { QuotaLedger } = await import('@/features/quota/components/QuotaLedger');
import type { QuotaLedgerProps } from '@/features/quota/components/QuotaLedger';

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});
const props: QuotaLedgerProps = {
  entries: [
    {
      type: 'claude',
      file: {
        name: 'synthetic.json',
        label: 'Research',
        type: 'claude',
        authIndex: 'synthetic-index',
        account: 'private-synthetic-key',
      },
    },
  ],
  quotaFor: () => ({
    status: 'success',
    observedAt: '2026-10-28T20:00:00Z',
    windows: [
      {
        id: 'seven-day',
        label: '7-day limit',
        usedPercent: 25,
        resetLabel: '',
        resetAtMs: Date.parse('2099-01-01T00:00:00Z'),
      },
      { id: 'five-hour', label: '5-hour limit', usedPercent: 14, resetLabel: '', resetAtMs: null },
    ],
  }),
  disabled: false,
  refreshing: false,
  resettingName: null,
  onRefresh: () => {},
  onReset: () => {},
  resolvedTheme: 'dark',
};
function render(overrides: Partial<QuotaLedgerProps> = {}) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(QuotaLedger, { ...props, ...overrides }))
  );
}

describe('ledger quota rows', () => {
  test('renders real remaining values, an unknown Fable pool, and separate safe actions', () => {
    const html = render();
    expect(html).toContain('Research');
    expect(html).not.toContain('private-synthetic-key');
    expect(html).toContain('aria-valuenow="75"');
    expect(html).toContain('aria-valuenow="86"');
    expect((html.match(/role="meter"/g) ?? []).length).toBe(3);
    expect(html).toContain('Not reported');
    expect(html).toContain('Refresh quota');
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*title="[^"]+"[^>]*>[\s\S]*?Reset limits/);
    expect(html).toContain('Start account window');
  });
  test('a failed read remains actionable and is never rendered as 100 percent free', () => {
    const html = render({
      quotaFor: () => ({ status: 'error', windows: [], error: 'synthetic failure' }),
    });
    expect(html).toContain('Could not load quota');
    expect(html).not.toContain('aria-valuenow="100"');
    expect(html).toContain('Refresh quota');
  });
  test('a concurrent page refresh prevents duplicate row reads', () => {
    const html = render({ refreshing: true });
    expect(html).toMatch(/<button type="button" disabled="">[\s\S]*?Refresh quota/);
  });
});
