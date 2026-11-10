import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { STORAGE_KEY_AUTH } from '@/utils/constants';
import { useAuthStore } from '@/stores/useAuthStore';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  useAuthStore.setState({ isAuthenticated: false, apiBase: '', managementKey: '' });
});

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('v2 login persistence', () => {
  test.each(['enc::v1::obsolete', '{"state":{"managementKey":"old-key"}}'])(
    'discards old auth storage without migrating it: %s',
    async (raw) => {
      values.set(STORAGE_KEY_AUTH, raw);
      values.set('managementKey', 'legacy-key');
      values.set('isLoggedIn', 'true');
      values.set('theme', 'dark');
      values.set('language', 'zh-CN');
      await useAuthStore.persist.rehydrate();
      expect(useAuthStore.getState().managementKey).toBe('');
      expect(useAuthStore.getState().hasRestorableSession()).toBe(false);
      expect(values.has(STORAGE_KEY_AUTH)).toBe(false);
      expect(values.has('managementKey')).toBe(false);
      expect(values.has('isLoggedIn')).toBe(false);
      expect(values.get('theme')).toBe('dark');
      expect(values.get('language')).toBe('zh-CN');
    }
  );

  test('does not restore standalone legacy credentials without an auth record', async () => {
    values.delete(STORAGE_KEY_AUTH);
    values.set('managementKey', 'legacy-key');
    values.set('isLoggedIn', 'true');
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().hasRestorableSession()).toBe(false);
    expect(values.has('managementKey')).toBe(false);
    expect(values.has('isLoggedIn')).toBe(false);
  });

  test('restores a new remembered login', async () => {
    obfuscatedStorage.setItem(STORAGE_KEY_AUTH, {
      state: {
        apiBase: 'http://proxy.example.com',
        managementKey: 'test-key',
        rememberPassword: true,
      },
      version: 0,
    });
    values.set('isLoggedIn', 'true');
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().managementKey).toBe('test-key');
    expect(useAuthStore.getState().hasRestorableSession()).toBe(true);
  });

  test('does not persist a key when remember password is disabled', () => {
    useAuthStore.setState({ managementKey: 'not-persisted', rememberPassword: false });
    const saved = obfuscatedStorage.getItem<{ state: { managementKey?: string } }>(
      STORAGE_KEY_AUTH
    );
    expect(saved?.state.managementKey).toBeUndefined();
  });
});
