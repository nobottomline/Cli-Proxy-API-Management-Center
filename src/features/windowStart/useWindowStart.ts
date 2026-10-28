import { create } from 'zustand';
import { useAuthStore } from '@/stores/useAuthStore';
import { fetchWindows, sessionId, startWindow, type WindowSnapshot } from './api';

export const useWindows = create<
  WindowSnapshot & {
    error: boolean;
    loading: boolean;
    refresh: () => Promise<void>;
    start: (index?: string) => Promise<void>;
  }
>((set) => ({
  busy: false,
  accounts: [],
  error: false,
  loading: false,
  refresh: async () => {
    const session = sessionId();
    try {
      const snapshot = await fetchWindows();
      if (session === sessionId()) set({ ...snapshot, error: false });
    } catch {
      if (session === sessionId()) set({ error: true });
    }
  },
  start: async (index) => {
    const session = sessionId();
    set({ loading: true, error: false });
    try {
      await startWindow(index);
      if (session !== sessionId()) return;
      const snapshot = await fetchWindows();
      if (session === sessionId()) set({ ...snapshot, error: false });
    } catch {
      if (session === sessionId()) set({ error: true });
    } finally {
      if (session === sessionId()) set({ loading: false });
    }
  },
}));

useAuthStore.subscribe((next, previous) => {
  if (next.apiBase !== previous.apiBase || next.managementKey !== previous.managementKey) {
    useWindows.setState({
      accounts: [],
      busy: false,
      error: false,
      loading: false,
    });
  }
});
