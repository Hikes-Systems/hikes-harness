import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Bootstrap, ProviderId, SettingsPatch, TestProviderResult } from "@shared/protocol";
import {
  ApiError,
  getBootstrap,
  saveProvider as saveProviderApi,
  saveSettings as saveSettingsApi,
  testProvider as testProviderApi,
} from "./api";

interface ServerCtx {
  boot: Bootstrap | null;
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
  refresh: () => Promise<void>;
  saveProvider: (
    id: ProviderId,
    patch: {
      enabled?: boolean;
      apiKey?: string;
      clearKey?: boolean;
      baseUrl?: string;
      customModel?: string;
    },
  ) => Promise<void>;
  testProvider: (
    id: ProviderId,
    draft: { apiKey?: string; baseUrl?: string; customModel?: string },
  ) => Promise<TestProviderResult>;
  saveSettings: (patch: SettingsPatch) => Promise<void>;
}

const Ctx = createContext<ServerCtx | null>(null);

export function ServerProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getBootstrap();
      if (!mounted.current) return;
      setBoot(next);
      setError(null);
      setUnauthorized(false);
    } catch (caught) {
      if (!mounted.current) return;
      const isAuth = caught instanceof ApiError && caught.status === 401;
      setUnauthorized(isAuth);
      setError(
        isAuth
          ? "This harness needs its launch token."
          : caught instanceof ApiError
            ? caught.message
            : caught instanceof TypeError
              ? "Can't reach the local harness. Start it with `npm start`, then reload this page."
              : caught instanceof Error
                ? caught.message
                : String(caught),
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const saveProvider = useCallback<ServerCtx["saveProvider"]>(
    async (id, patch) => {
      await saveProviderApi(id, patch);
      await load();
    },
    [load],
  );

  const testProvider = useCallback<ServerCtx["testProvider"]>(
    async (id, draft) => {
      const result = await testProviderApi(id, draft);
      if (result.ok) await load();
      return result;
    },
    [load],
  );

  const saveSettings = useCallback<ServerCtx["saveSettings"]>(
    async (patch) => {
      await saveSettingsApi(patch);
      await load();
    },
    [load],
  );

  const value = useMemo(
    () => ({
      boot,
      loading,
      error,
      unauthorized,
      refresh,
      saveProvider,
      testProvider,
      saveSettings,
    }),
    [boot, loading, error, unauthorized, refresh, saveProvider, testProvider, saveSettings],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServer(): ServerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ServerProvider missing");
  return ctx;
}
