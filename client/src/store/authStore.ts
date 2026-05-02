import { create } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  impersonatingUser: { id: string; email: string; displayName: string } | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  setImpersonating: (user: { id: string; email: string; displayName: string } | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  impersonatingUser: null,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  clearAuth: () => set({ user: null, accessToken: null, impersonatingUser: null }),
  setImpersonating: (impersonatingUser) => set({ impersonatingUser }),
}));
