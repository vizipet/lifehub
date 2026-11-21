import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clearTokens,
  hasStoredSession,
  jsonBody,
  messageOf,
  readRefreshToken,
  request,
  saveTokens,
  type AuthResult,
} from '../api';
import type { User, UserRole } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authNotice: string;
  setAuthenticated: (auth: AuthResult) => void;
  updateUser: (user: User) => void;
  clearLocalSession: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa ser usado dentro de AuthProvider.');
  return value;
}

export function homeFor(role: UserRole | undefined): string {
  if (role === 'PROFESSIONAL') return '/medico';
  if (role === 'ADMIN') return '/admin';
  return '/inicio';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    if (!hasStoredSession()) {
      setLoading(false);
      return;
    }
    request<{ data: User }>('/users/me')
      .then(({ data }) => setUser(data))
      .catch((error: unknown) => {
        setUser(null);
        setAuthNotice(`Não foi possível restaurar sua sessão: ${messageOf(error)}`);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authNotice,
      setAuthenticated: (auth) => {
        saveTokens(auth);
        setUser(auth.user);
        setAuthNotice('');
      },
      updateUser: setUser,
      clearLocalSession: () => {
        clearTokens();
        setUser(null);
      },
      signOut: async () => {
        const refreshToken = readRefreshToken();
        try {
          if (refreshToken) {
            await request('/auth/logout', { method: 'POST', body: jsonBody({ refreshToken }) }, false);
          }
        } catch {
          // Mesmo se a API estiver fora, a sessão local é apagada.
        } finally {
          clearTokens();
          setUser(null);
        }
      },
    }),
    [authNotice, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
