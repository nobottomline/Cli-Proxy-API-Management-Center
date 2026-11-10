import { afterEach, describe, expect, test } from 'bun:test';
import {
  QUOTA_PRIVACY_KEY,
  readQuotaPrivacy,
  useQuotaPrivacy,
} from '@/features/quota/privacyPreference';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  useQuotaPrivacy.setState({ hideEmails: false });
});

describe('quota privacy preference', () => {
  test('persists the reversible toggle independently of the quota view', () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key),
          setItem: (key: string, value: string) => values.set(key, value),
        },
      },
    });
    expect(readQuotaPrivacy()).toBe(false);
    useQuotaPrivacy.getState().setHideEmails(true);
    expect(values.get(QUOTA_PRIVACY_KEY)).toBe('true');
    expect(readQuotaPrivacy()).toBe(true);
    useQuotaPrivacy.getState().setHideEmails(false);
    expect(readQuotaPrivacy()).toBe(false);
  });

  test('the toggle still works when storage is blocked', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get localStorage() {
          throw new Error('blocked');
        },
      },
    });
    expect(readQuotaPrivacy()).toBe(false);
    useQuotaPrivacy.getState().setHideEmails(true);
    expect(useQuotaPrivacy.getState().hideEmails).toBe(true);
  });
});
