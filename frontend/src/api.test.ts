import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokens, request, saveTokens } from './api';

const stored = new Map<string, string>();

describe('API client', () => {
  beforeEach(() => {
    stored.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envia access token e renova a sessão uma vez ao receber 401', async () => {
    saveTokens({ accessToken: 'expired-access', refreshToken: 'same-session.old-refresh' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { accessToken: 'new-access', refreshToken: 'same-session.new-refresh', expiresIn: 900 },
      }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request<{ data: unknown[] }>('/patients')).resolves.toEqual({ data: [] });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer expired-access');
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ refreshToken: 'same-session.old-refresh' }));
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer new-access');
    expect(stored.get('lifehub.refreshToken')).toBe('same-session.new-refresh');
  });

  it.each([200, 401])('descarta resposta %i de uma escrita antiga após novo login sem repetir a operação', async (status) => {
    saveTokens({ accessToken: 'old-account-access', refreshToken: 'old-session.secret' });
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = request('/patients', { method: 'POST', body: '{}' });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    saveTokens({ accessToken: 'new-account-access', refreshToken: 'new-session.secret' });
    complete(new Response('{}', { status, headers: { 'content-type': 'application/json' } }));
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(stored.get('lifehub.accessToken')).toBe('new-account-access');
    expect(stored.get('lifehub.refreshToken')).toBe('new-session.secret');
  });

  it('não sobrescreve um novo login com uma renovação antiga ainda em andamento', async () => {
    saveTokens({ accessToken: 'expired', refreshToken: 'old-session.secret' });
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = request('/patients');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    saveTokens({ accessToken: 'new-account-access', refreshToken: 'new-session.secret' });
    complete(new Response(JSON.stringify({ data: { accessToken: 'old-account-rotated', refreshToken: 'old-session.rotated' } }), {
      status: 201, headers: { 'content-type': 'application/json' },
    }));
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stored.get('lifehub.accessToken')).toBe('new-account-access');
    expect(stored.get('lifehub.refreshToken')).toBe('new-session.secret');
  });

  it('coordena duas abas pelo Web Locks e reutiliza a sessão já renovada', async () => {
    vi.resetModules();
    const firstTab = await import('./api');
    vi.resetModules();
    const secondTab = await import('./api');
    let queue = Promise.resolve<unknown>(undefined);
    const lock = vi.fn((_name: string, callback: () => Promise<string>) => {
      const operation = queue.then(callback);
      queue = operation.catch(() => undefined);
      return operation;
    });
    vi.stubGlobal('navigator', { locks: { request: lock } });
    firstTab.saveTokens({ accessToken: 'expired', refreshToken: 'same-session.old-refresh' });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ data: { accessToken: 'fresh', refreshToken: 'same-session.new-refresh' } }), {
          status: 201, headers: { 'content-type': 'application/json' },
        });
      }
      const authenticated = new Headers(init?.headers).get('Authorization') === 'Bearer fresh';
      return new Response(JSON.stringify(authenticated ? { data: [] } : { message: 'expired' }), {
        status: authenticated ? 200 : 401, headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(Promise.all([firstTab.request('/patients'), secondTab.request('/patients')]))
      .resolves.toEqual([{ data: [] }, { data: [] }]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(stored.get('lifehub.refreshToken')).toBe('same-session.new-refresh');
    expect(lock).toHaveBeenCalledTimes(2);
  });

  it('envia FormData sem definir Content-Type manualmente', async () => {
    saveTokens({ accessToken: 'access', refreshToken: 'refresh' });

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: 'doc-id', photoUrl: 'https://storage.example/photo.png' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.append('file', new Blob(['photo'], { type: 'image/png' }), 'crm.png');

    await request('/verification/documents', {
      method: 'PATCH',
      body: form,
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer access');
  });

  it('limpa os dois tokens ao encerrar a sessão local', () => {
    saveTokens({ accessToken: 'access', refreshToken: 'refresh' });
    clearTokens();

    expect(stored.has('lifehub.accessToken')).toBe(false);
    expect(stored.has('lifehub.refreshToken')).toBe(false);
  });

  it.each([
    [403, 'Papel de usuário sem acesso.'],
    [404, 'Pet não encontrado.'],
  ])('preserva erros HTTP %i da API', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: status,
      code: status === 403 ? 'FORBIDDEN' : 'PET_NOT_FOUND',
      message,
    }), { status, headers: { 'content-type': 'application/json' } })));

    await expect(request('/patients/invalid', {}, false)).rejects.toMatchObject({
      status,
      message,
    });
  });
});
