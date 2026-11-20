import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, ApiError, setAuthToken } from './api';
import type { AuthResult, Me } from './types';

const TOKEN_KEY = 'landconnect.token';

interface SessionValue {
  user: Me | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (b: Parameters<typeof api.register>[0]) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: Me) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = useCallback(async (res: AuthResult) => {
    setAuthToken(res.token);
    await AsyncStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(TOKEN_KEY);
      if (saved) {
        setAuthToken(saved);
        try {
          setUser(await api.me());
          setToken(saved);
        } catch (e) {
          // Only forget the token if the server rejected it; keep it when offline.
          if (e instanceof ApiError && e.status === 401) await signOut();
          else setToken(saved);
        }
      }
      setLoading(false);
    })();
  }, [signOut]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      token,
      loading,
      signIn: async (email, password) => adopt(await api.login({ email, password })),
      signUp: async (b) => adopt(await api.register(b)),
      signOut,
      setUser,
    }),
    [user, token, loading, adopt, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** For screens behind the auth guard, where a user is always present. */
export function useMe(): Me {
  const { user } = useSession();
  if (!user) throw new Error('useMe called while signed out');
  return user;
}
