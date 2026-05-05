import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface AuthResponse {
  access_token: string;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const isAuthenticated = !!token;

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', res.access_token);
    setToken(res.access_token);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api.post<AuthResponse>('/auth/register', { email, password, name });
    localStorage.setItem('token', res.access_token);
    setToken(res.access_token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
  }, []);

  return { isAuthenticated, login, register, logout };
}
