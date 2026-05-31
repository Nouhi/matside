import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

interface AuthResponse {
  access_token: string;
}

export type Role = 'ORGANIZER' | 'COACH' | 'ADMIN';

// Decode the role claim from a JWT without verifying it (the server verifies;
// the client only reads role to pick which dashboard to show). Falls back to
// ORGANIZER for pre-role tokens, mirroring the backend's jwt.strategy default.
function roleFromToken(token: string | null): Role {
  if (!token) return 'ORGANIZER';
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { role?: string };
    if (payload.role === 'COACH' || payload.role === 'ADMIN') return payload.role;
    return 'ORGANIZER';
  } catch {
    return 'ORGANIZER';
  }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const isAuthenticated = !!token;
  const role = roleFromToken(token);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', res.access_token);
    setToken(res.access_token);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, role: Role = 'ORGANIZER') => {
      const res = await api.post<AuthResponse>('/auth/register', {
        email,
        password,
        name,
        role,
      });
      localStorage.setItem('token', res.access_token);
      setToken(res.access_token);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
  }, []);

  return { isAuthenticated, role, login, register, logout };
}
