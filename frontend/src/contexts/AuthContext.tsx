import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, clearToken, setToken } from "@/src/api/client";

type User = { user_id: string; email: string; name: string; picture?: string };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  processSessionId: (id: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const processSessionId = useCallback(async (session_id: string) => {
    try {
      const { session_token, user: u } = await api.exchangeSession(session_id);
      await setToken(session_token);
      setUser(u);
    } catch (e) {
      console.warn("session exchange failed", e);
    }
  }, []);

  const checkExisting = useCallback(async () => {
    try {
      const { user: u } = await api.me();
      setUser(u);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  // Cold-start + web hash handling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === "web") {
        try {
          const w = typeof window !== "undefined" ? window : null;
          if (w) {
            const url = new URL(w.location.href);
            const hash = w.location.hash || "";
            let session_id: string | null = null;
            if (hash.includes("session_id=")) {
              const params = new URLSearchParams(hash.replace(/^#/, ""));
              session_id = params.get("session_id");
            } else {
              session_id = url.searchParams.get("session_id");
            }
            if (session_id) {
              await processSessionId(session_id);
              w.history.replaceState(null, "", w.location.pathname);
              if (!cancelled) setLoading(false);
              return;
            }
          }
        } catch {}
        await checkExisting();
        if (!cancelled) setLoading(false);
        return;
      }
      // Mobile: cold start deep link
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const parsed = Linking.parse(initialUrl);
          const sid =
            (parsed.queryParams?.session_id as string | undefined) ||
            extractHashSession(initialUrl);
          if (sid) {
            await processSessionId(sid);
            if (!cancelled) setLoading(false);
            return;
          }
        }
      } catch {}
      await checkExisting();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [processSessionId, checkExisting]);

  // Hot deep link listener (mobile)
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", async ({ url }) => {
      const parsed = Linking.parse(url);
      const sid =
        (parsed.queryParams?.session_id as string | undefined) ||
        extractHashSession(url);
      if (sid) await processSessionId(sid);
    });
    return () => sub.remove();
  }, [processSessionId]);

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? (typeof window !== "undefined" ? `${window.location.origin}/` : "/")
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const parsed = Linking.parse(result.url);
      const sid =
        (parsed.queryParams?.session_id as string | undefined) ||
        extractHashSession(result.url);
      if (sid) await processSessionId(sid);
    }
  }, [processSessionId]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    await clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, loginWithGoogle, logout, processSessionId }),
    [user, loading, loginWithGoogle, logout, processSessionId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function extractHashSession(url: string): string | null {
  const idx = url.indexOf("#");
  if (idx === -1) return null;
  const frag = url.substring(idx + 1);
  const params = new URLSearchParams(frag);
  return params.get("session_id");
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
