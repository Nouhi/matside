import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('useAuth', () => {
  it('isAuthenticated is false when no token in localStorage', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('isAuthenticated is true when token exists in localStorage', () => {
    localStorage.setItem('token', 'test-token');
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login calls /auth/login and stores token', async () => {
    vi.mocked(api.post).mockResolvedValue({ access_token: 'jwt-token' });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('user@test.com', 'password123');
    });

    expect(api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'user@test.com',
      password: 'password123',
    });
    expect(localStorage.getItem('token')).toBe('jwt-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('register calls /auth/register and stores token', async () => {
    vi.mocked(api.post).mockResolvedValue({ access_token: 'new-token' });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.register('user@test.com', 'password123', 'Test User');
    });

    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      email: 'user@test.com',
      password: 'password123',
      name: 'Test User',
      role: 'ORGANIZER',
    });
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout removes token from localStorage', () => {
    localStorage.setItem('token', 'existing-token');
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.logout();
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login throws on API error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Invalid credentials'));
    const { result } = renderHook(() => useAuth());

    await expect(
      act(async () => {
        await result.current.login('user@test.com', 'wrong-password');
      })
    ).rejects.toThrow('Invalid credentials');

    expect(localStorage.getItem('token')).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  // Minimal unsigned JWT (header.payload.signature) — only the payload matters
  // for the client-side role read.
  const tokenWithRole = (role?: string) => {
    const payload = btoa(JSON.stringify(role ? { sub: 'u', role } : { sub: 'u' }));
    return `h.${payload}.s`;
  };

  it('decodes COACH role from the token', () => {
    localStorage.setItem('token', tokenWithRole('COACH'));
    const { result } = renderHook(() => useAuth());
    expect(result.current.role).toBe('COACH');
  });

  it('defaults a roleless (pre-role) token to ORGANIZER', () => {
    localStorage.setItem('token', tokenWithRole());
    const { result } = renderHook(() => useAuth());
    expect(result.current.role).toBe('ORGANIZER');
  });

  it('defaults an unknown role claim to ORGANIZER (never trusts a bogus value)', () => {
    localStorage.setItem('token', tokenWithRole('SUPERUSER'));
    const { result } = renderHook(() => useAuth());
    expect(result.current.role).toBe('ORGANIZER');
  });
});
