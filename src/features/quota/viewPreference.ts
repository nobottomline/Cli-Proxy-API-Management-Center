import { create } from 'zustand';

export type QuotaView = 'ledger' | 'classic';
export const QUOTA_VIEW_KEY = 'quotaPage.view';

export function readQuotaView(): QuotaView {
  try {
    return typeof window !== 'undefined' &&
      window.localStorage.getItem(QUOTA_VIEW_KEY) === 'classic'
      ? 'classic'
      : 'ledger';
  } catch {
    return 'ledger';
  }
}

export const useQuotaView = create<{
  view: QuotaView;
  setView: (view: QuotaView) => void;
}>((set) => ({
  view: readQuotaView(),
  setView: (view) => {
    if (view !== 'ledger' && view !== 'classic') return;
    try {
      window.localStorage.setItem(QUOTA_VIEW_KEY, view);
    } catch {
      // The switch remains usable when browser storage is unavailable.
    }
    set({ view });
  },
}));
