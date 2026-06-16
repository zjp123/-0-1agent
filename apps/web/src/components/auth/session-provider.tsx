"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { notify } from "@/components/notifications/toast-provider";
import {
  consoleLogin,
  consoleLogout,
  consoleRefresh,
  type AuthCredentials,
  type ConsoleAuthResponse,
  type ConsoleAuthUser,
  type ConsoleLoginInput,
} from "@/lib/api/client";

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: ConsoleAuthUser;
};

type SessionStatus = "loading" | "authenticated" | "anonymous";

type SessionContextValue = {
  status: SessionStatus;
  user?: ConsoleAuthUser;
  session?: StoredSession;
  credentials: AuthCredentials;
  hasPermission: (permission: string) => boolean;
  login: (input: ConsoleLoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const STORAGE_KEY = "enterprise-agent:web-session";
const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | undefined>();
  const [status, setStatus] = useState<SessionStatus>("loading");

  const applySession = useCallback((response: ConsoleAuthResponse) => {
    const nextSession: StoredSession = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: response.expiresAt,
      refreshTokenExpiresAt: response.refreshTokenExpiresAt,
      sessionId: response.sessionId,
      user: response.user,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession(undefined);
    setStatus("anonymous");
  }, []);

  const refresh = useCallback(async () => {
    const current = session ?? readStoredSession();
    if (!current) {
      clearSession();
      return;
    }
    const response = await consoleRefresh(current.refreshToken);
    applySession(response);
  }, [applySession, clearSession, session]);

  useEffect(() => {
    async function restore(): Promise<void> {
      const stored = readStoredSession();
      if (!stored) {
        setStatus("anonymous");
        return;
      }
      if (new Date(stored.refreshTokenExpiresAt).getTime() <= Date.now()) {
        clearSession();
        return;
      }
      setSession(stored);
      setStatus("authenticated");
      if (new Date(stored.expiresAt).getTime() <= Date.now() + 60_000) {
        try {
          const response = await consoleRefresh(stored.refreshToken);
          applySession(response);
        } catch {
          clearSession();
        }
      }
    }

    void restore();
  }, [applySession, clearSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user: session?.user,
      session,
      credentials: session?.accessToken ? { accessToken: session.accessToken } : {},
      hasPermission: (permission: string) =>
        Boolean(session?.user.permissions.includes(permission as never)),
      login: async (input) => {
        const response = await consoleLogin(input);
        applySession(response);
        notify({
          title: "Signed in",
          message: `${response.user.userId} authenticated for tenant ${response.user.tenantId}.`,
          tone: "success",
        });
      },
      logout: async () => {
        const token = session?.refreshToken;
        clearSession();
        if (token) {
          await consoleLogout(token);
        }
        notify({ title: "Signed out", tone: "neutral" });
      },
      refresh,
    }),
    [applySession, clearSession, refresh, session, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return value;
}

export function useEffectiveCredentials(apiKey: string, serviceToken: string): {
  credentials: AuthCredentials;
  hasCredentials: boolean;
  usingSession: boolean;
} {
  const { credentials: sessionCredentials } = useSession();
  return useMemo(() => {
    if (sessionCredentials.accessToken) {
      return {
        credentials: sessionCredentials,
        hasCredentials: true,
        usingSession: true,
      };
    }

    const credentials: AuthCredentials = {
      apiKey: apiKey.trim() || undefined,
      serviceToken: serviceToken.trim() || undefined,
    };
    return {
      credentials,
      hasCredentials: Boolean(credentials.apiKey || credentials.serviceToken),
      usingSession: false,
    };
  }, [apiKey, serviceToken, sessionCredentials]);
}

function readStoredSession(): StoredSession | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
