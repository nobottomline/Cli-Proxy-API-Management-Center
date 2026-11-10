import { create } from 'zustand';

export const QUOTA_PRIVACY_KEY = 'quotaPage.hideEmails';

export function readQuotaPrivacy(): boolean {
  try {
    return (
      typeof window !== 'undefined' && window.localStorage.getItem(QUOTA_PRIVACY_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

export const useQuotaPrivacy = create<{
  hideEmails: boolean;
  setHideEmails: (hidden: boolean) => void;
}>((set) => ({
  hideEmails: readQuotaPrivacy(),
  setHideEmails: (hideEmails) => {
    try {
      window.localStorage.setItem(QUOTA_PRIVACY_KEY, String(hideEmails));
    } catch {
      // Privacy remains usable when browser storage is unavailable.
    }
    set({ hideEmails });
  },
}));
