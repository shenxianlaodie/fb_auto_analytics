import { create } from 'zustand';

interface AuthState {
  token: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  setAuth: (token: string, userId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('fb_auth_token'),
  userId: localStorage.getItem('fb_user_id'),
  isAuthenticated: !!localStorage.getItem('fb_auth_token'),

  setAuth: (token: string, userId: string) => {
    localStorage.setItem('fb_auth_token', token);
    localStorage.setItem('fb_user_id', userId);
    set({ token, userId, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('fb_auth_token');
    localStorage.removeItem('fb_user_id');
    localStorage.removeItem('fb_account_id');
    localStorage.removeItem('fb_account_name');
    set({ token: null, userId: null, isAuthenticated: false });
  },
}));
