import { afterEach, describe, expect, test } from 'bun:test';
import { QUOTA_VIEW_KEY, readQuotaView, useQuotaView } from '@/features/quota/viewPreference';

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
  useQuotaView.setState({ view: 'ledger' });
});

describe('quota view preference', () => {
  test('new installations and unsupported saved values use Ledger', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readQuotaView()).toBe('ledger');
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: () => 'unexpected' } };
    expect(readQuotaView()).toBe('ledger');
  });
  test('Cards survives reload and switching back persists Ledger without resetting quota data', () => {
    const storage = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => storage.get(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    };
    useQuotaView.getState().setView('classic');
    expect(storage.get(QUOTA_VIEW_KEY)).toBe('classic');
    expect(readQuotaView()).toBe('classic');
    useQuotaView.getState().setView('ledger');
    expect(readQuotaView()).toBe('ledger');
  });
  test('storage errors do not break the reversible switch', () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage() {
        throw new Error('storage unavailable');
      },
    };
    expect(readQuotaView()).toBe('ledger');
    useQuotaView.getState().setView('classic');
    expect(useQuotaView.getState().view).toBe('classic');
  });
});
