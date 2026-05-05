import { api } from '@/lib/api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  localStorage.clear();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

describe('api', () => {
  it('get sends GET request to the path', async () => {
    await api.get('/test');

    expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
    expect(mockFetch.mock.calls[0][1].method).toBeUndefined();
  });

  it('post sends POST with JSON body', async () => {
    await api.post('/test', { key: 'value' });

    expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('patch sends PATCH with JSON body', async () => {
    await api.patch('/test', { key: 'updated' });

    expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ key: 'updated' }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('delete sends DELETE request', async () => {
    await api.delete('/test');

    expect(mockFetch).toHaveBeenCalledWith('/test', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('includes Authorization header when token is in localStorage', async () => {
    localStorage.setItem('token', 'my-jwt-token');

    await api.get('/protected');

    expect(mockFetch).toHaveBeenCalledWith('/protected', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer my-jwt-token',
      }),
    }));
  });

  it('does not include Authorization header when no token', async () => {
    await api.get('/public');

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws Error with message from response body on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Unauthorized' }),
    });

    await expect(api.get('/secret')).rejects.toThrow('Unauthorized');
  });

  it('throws generic error when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(api.get('/broken')).rejects.toThrow('Request failed: 500');
  });
});
