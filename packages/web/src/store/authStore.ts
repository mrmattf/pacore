import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: any | null;
  mustChangePassword: boolean;
  setAuth: (token: string, user: any, refreshToken?: string, mustChangePassword?: boolean) => void;
  updateToken: (token: string, refreshToken: string) => void;
  clearMustChangePassword: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      mustChangePassword: false,
      setAuth: (token, user, refreshToken, mustChangePassword) =>
        set({ token, user, refreshToken: refreshToken ?? null, mustChangePassword: mustChangePassword ?? false }),
      updateToken: (token, refreshToken) => set({ token, refreshToken }),
      clearMustChangePassword: () => set({ mustChangePassword: false }),
      logout: () => set({ token: null, refreshToken: null, user: null, mustChangePassword: false }),
    }),
    {
      name: 'pacore-auth',
    }
  )
);
