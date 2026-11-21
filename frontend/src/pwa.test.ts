/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cache = {
    addAll: vi.fn(async (_urls: string[]) => undefined),
    match: vi.fn(async () => new Response('<script src="/assets/index-main.js"></script><link href="/assets/index-main.css" rel="stylesheet">')),
    put: vi.fn(async () => undefined),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['other-app-cache', 'vizipet-shell-v4', 'lifehub-shell-v1', 'lifehub-shell-v2']),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => new Response('offline shell')),
  };
  const fetch = vi.fn(async () => new Response('private image', { headers: { 'Cache-Control': 'no-store' } }));
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin: 'https://lifehub.example' },
      clients: { claim: vi.fn() }, skipWaiting: vi.fn(),
      addEventListener: (name: string, handler: (event: unknown) => void) => { listeners[name] = handler; },
    }, caches, fetch, URL,
  });
  return { listeners, cache, caches, fetch };
}

describe('PWA cache boundaries', () => {
  it('precarrega os bundles da primeira instalação para permitir abrir offline', async () => {
    const { listeners, cache } = worker();
    const pending: Promise<unknown>[] = [];
    listeners.install({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
    expect(cache.addAll).toHaveBeenLastCalledWith(['/assets/index-main.js', '/assets/index-main.css']);
  });

  it('remove apenas caches antigos do próprio app (inclusive do antigo VIZIPET)', async () => {
    const { listeners, caches } = worker();
    const pending: Promise<unknown>[] = [];
    listeners.activate({ waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
    expect(caches.delete).toHaveBeenCalledTimes(2);
    expect(caches.delete).toHaveBeenCalledWith('vizipet-shell-v4');
    expect(caches.delete).toHaveBeenCalledWith('lifehub-shell-v1');
  });

  it.each([
    ['/api/v1/local/pet-photos/photo.jpg', false],
    ['/assets/private.jpg', true],
    ['/private/photo.jpg', false],
  ])('não intercepta recurso privado %s', (path, authenticated) => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.fetch({ request: { method: 'GET', url: `https://lifehub.example${path}`, mode: 'cors',
      destination: 'image', headers: new Headers(authenticated ? { Authorization: 'Bearer token' } : {}) }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it('respeita no-store mesmo quando a imagem está na pasta de assets', async () => {
    const { listeners, cache, caches } = worker();
    caches.match.mockResolvedValueOnce(undefined as unknown as Response);
    let response: Promise<Response> | undefined;
    listeners.fetch({ request: { method: 'GET', url: 'https://lifehub.example/assets/photo.jpg', mode: 'cors',
      destination: 'image', headers: new Headers() }, respondWith: (promise: Promise<Response>) => { response = promise; } });
    await response;
    expect(cache.put).not.toHaveBeenCalled();
  });
});
