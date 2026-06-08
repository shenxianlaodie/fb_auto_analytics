import { create } from 'zustand';
import { FBAdAccount } from '../types/facebook';

interface AccountState {
  accountId: string | null;
  accountName: string | null;
  accounts: FBAdAccount[];
  setAccount: (id: string, name: string) => void;
  setAccounts: (accounts: FBAdAccount[]) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  accountId: localStorage.getItem('fb_account_id'),
  accountName: localStorage.getItem('fb_account_name'),
  accounts: [],

  setAccount: (id: string, name: string) => {
    localStorage.setItem('fb_account_id', id);
    localStorage.setItem('fb_account_name', name);
    set({ accountId: id, accountName: name });
  },

  setAccounts: (accounts: FBAdAccount[]) => {
    const sorted = [...accounts].sort((a, b) => {
      if (a.account_status === 1 && b.account_status !== 1) return -1;
      if (a.account_status !== 1 && b.account_status === 1) return 1;
      return (a.name || a.id).localeCompare(b.name || b.id);
    });
    set({ accounts: sorted });

    const currentId = localStorage.getItem('fb_account_id');
    const currentName = localStorage.getItem('fb_account_name');

    if (currentId && sorted.some((a) => a.id === currentId)) {
      set({ accountId: currentId, accountName: currentName });
      return;
    }

    const firstActive = sorted.find((a) => a.account_status === 1);
    if (firstActive) {
      localStorage.setItem('fb_account_id', firstActive.id);
      localStorage.setItem('fb_account_name', firstActive.name);
      set({ accountId: firstActive.id, accountName: firstActive.name });
    }
  },
}));
