import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

export const draftSocket = io(`${import.meta.env.VITE_API_URL ?? ''}/draft`, {
  autoConnect: false,
  auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
});
