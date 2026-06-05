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
    // Filter: only show active ad accounts
    const active = accounts.filter(a => a.account_status === 1);
    set({ accounts: active });

    // Restore previously selected account, or auto-pick first active
    const currentId = localStorage.getItem('fb_account_id');
    const currentName = localStorage.getItem('fb_account_name');

    if (currentId && active.some(a => a.id === currentId)) {
      // Restore previous selection
      set({ accountId: currentId, accountName: currentName });
    } else if (active.length > 0) {
      // Auto-select first active account
      set({ accountId: active[0].id, accountName: active[0].name });
    }
  },
}));
