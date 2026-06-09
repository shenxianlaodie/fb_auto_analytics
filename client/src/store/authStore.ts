import { create } from 'zustand';

interface AuthState {
  token: string | null;
  userId: string | null;
  userRole: 'admin' | 'viewer' | null;
  userAllowedAccounts: string[];
  isAuthenticated: boolean;
  setAuth: (token: string, userId: string) => void;
  setUserInfo: (role: string, allowedAccounts: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('fb_auth_token'),
  userId: localStorage.getItem('fb_user_id'),
  userRole: (localStorage.getItem('fb_user_role') as 'admin' | 'viewer') || null,
  userAllowedAccounts: JSON.parse(localStorage.getItem('fb_allowed_accounts') || '[]'),
  isAuthenticated: !!localStorage.getItem('fb_auth_token'),

  setAuth: (token: string, userId: string) => {
    localStorage.setItem('fb_auth_token', token);
    localStorage.setItem('fb_user_id', userId);
    set({ token, userId, isAuthenticated: true });
  },

  setUserInfo: (role: string, allowedAccounts: string[]) => {
    localStorage.setItem('fb_user_role', role);
    localStorage.setItem('fb_allowed_accounts', JSON.stringify(allowedAccounts));
    set({ userRole: role as 'admin' | 'viewer', userAllowedAccounts: allowedAccounts });
  },

  logout: () => {
    localStorage.removeItem('fb_auth_token');
    localStorage.removeItem('fb_user_id');
    localStorage.removeItem('fb_user_role');
    localStorage.removeItem('fb_allowed_accounts');
    localStorage.removeItem('fb_account_id');
    localStorage.removeItem('fb_account_name');
    set({
      token: null,
      userId: null,
      userRole: null,
      userAllowedAccounts: [],
      isAuthenticated: false,
    });
  },
}));
