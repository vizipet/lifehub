import type { User } from './lib/types';

export type { User, UserRole } from './lib/types';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiEnvelope<T> {
  data: T;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1')
  .replace(/\/+$/, '');
const ACCESS_TOKEN_KEY = 'lifehub.accessToken';
const REFRESH_TOKEN_KEY = 'lifehub.refreshToken';
let refreshInFlight: Promise<string> | null = null;
let refreshSessionId: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function readRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens: { accessToken: string; refreshToken?: string }): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasStoredSession(): boolean {
  return Boolean(readAccessToken() && readRefreshToken());
}

function errorFromResponse(status: number, body: unknown): ApiError {
  const payload =
    typeof body === 'object' && body !== null
      ? (body as { message?: unknown; code?: unknown })
      : {};
  const rawMessage = payload.message;
  // O limitador de tentativas responde em inglês; o usuário vê em português.
  const message = status === 429
    ? 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.'
    : Array.isArray(rawMessage)
    ? rawMessage.join(' ')
    : typeof rawMessage === 'string'
      ? rawMessage
      : status === 403
        ? 'Você não tem permissão para realizar esta ação.'
        : status === 404
          ? 'Não encontramos o conteúdo solicitado.'
          : status >= 500
            ? 'O serviço está indisponível no momento. Tente novamente.'
            : 'Não foi possível concluir a solicitação.';

  return new ApiError(message, status, typeof payload.code === 'string' ? payload.code : undefined);
}

/**
 * Endereço completo de um arquivo servido pela API (ex.: foto enviada pelo médico,
 * que chega como "/public/professionals/:id/photo?v=..."). Fotos que já vêm com
 * o site ("/assets/...") ficam como estão.
 */
export function apiAssetUrl(path: string): string {
  return path.startsWith('/public/') ? `${API_BASE}${path}` : path;
}

async function responseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

function storedSessionId(): string | null {
  return readRefreshToken()?.split('.')[0] ?? null;
}

function sessionChanged(): ApiError {
  return new ApiError('A sessão foi alterada. Repita a ação na conta atual.', 401, 'SESSION_CHANGED');
}

async function refreshAccessToken(expiredAccessToken: string, sessionId: string | null): Promise<string> {
  if (storedSessionId() !== sessionId) throw sessionChanged();
  if (refreshInFlight && refreshSessionId === sessionId) return refreshInFlight;

  const refresh = async () => {
    if (storedSessionId() !== sessionId) throw sessionChanged();
    // Another tab may have rotated the shared credentials while we waited.
    const currentAccessToken = readAccessToken();
    if (currentAccessToken && currentAccessToken !== expiredAccessToken && readRefreshToken()) {
      return currentAccessToken;
    }
    const refreshToken = readRefreshToken();
    if (!refreshToken) {
      throw new ApiError('Refresh token ausente.', 401);
    }

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await responseBody(response);
    if (!response.ok) throw errorFromResponse(response.status, body);

    const result = (body as ApiEnvelope<RefreshResult>).data;
    if (readRefreshToken() !== refreshToken) {
      throw sessionChanged();
    }
    saveTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result.accessToken;
  };

  const operation = (async (): Promise<string> => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('lifehub-session-refresh', refresh);
    }
    return refresh();
  })();
  const pending = operation.finally(() => {
    if (refreshInFlight === pending) {
      refreshInFlight = null;
      refreshSessionId = null;
    }
  });

  refreshInFlight = pending;
  refreshSessionId = sessionId;
  return pending;
}

function notifySessionExpired(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const send = async (accessToken?: string) => {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (authenticated && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  };

  let accessToken = readAccessToken();
  const sessionId = storedSessionId();
  let response = await send(authenticated ? accessToken ?? undefined : undefined);
  if (authenticated && storedSessionId() !== sessionId) throw sessionChanged();

  if (response.status === 401 && authenticated && accessToken) {
    try {
      accessToken = await refreshAccessToken(accessToken, sessionId);
      response = await send(accessToken);
    } catch (error) {
      if (storedSessionId() !== sessionId || (error instanceof ApiError && error.code === 'SESSION_CHANGED')) {
        throw sessionChanged();
      }
      const currentAccessToken = readAccessToken();
      if (currentAccessToken && currentAccessToken !== accessToken && readRefreshToken()) {
        accessToken = currentAccessToken;
        response = await send(accessToken);
      } else {
        notifySessionExpired();
        throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
      }
    }
  }

  const body = await responseBody(response);
  if (authenticated && storedSessionId() !== sessionId) throw sessionChanged();
  if (!response.ok) {
    if (response.status === 401 && authenticated && accessToken &&
        storedSessionId() === sessionId && readAccessToken() === accessToken) notifySessionExpired();
    throw errorFromResponse(response.status, body);
  }
  return body as T;
}

export function unwrap<T>(response: ApiEnvelope<T>): T {
  return response.data;
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

/** Chave única por tentativa: repetir o clique não cria agendamento duplicado. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

/** Baixa um arquivo protegido (ex.: documento do médico) usando a sessão atual. */
export async function fetchBlob(path: string): Promise<Blob> {
  const token = readAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw errorFromResponse(response.status, await responseBody(response));
  return response.blob();
}
