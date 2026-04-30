import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiOrigin = import.meta.env.VITE_API_URL ?? '';
export const api = axios.create({ baseURL: `${apiOrigin}/api/v1`, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await axios.post(`${apiOrigin}/api/v1/auth/refresh`, {}, { withCredentials: true });
        useAuthStore.getState().setAuth(data.user, data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        useAuthStore.getState().clearAuth();
      }
    }
    return Promise.reject(err);
  },
);
