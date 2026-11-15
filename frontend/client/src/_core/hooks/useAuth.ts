import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { clearSessionToken } from "@/lib/sessionToken";
import { anonymousWorkspaceHeaders, WORKSPACE_KEY_STORAGE_KEY } from "@/lib/anonymousWorkspaceKey";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // Login is started via startLogin() in the effect below, only when we actually
  // navigate — never during render. startLogin() mints a one-time nonce + writes
  // the state cookie, so calling it per render would overwrite the cookie and
  // desync it from an in-flight login's `state`.
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const clearLocalAuth = () => {
      void utils.auth.me.cancel();
      utils.auth.me.setData(undefined, null);
    };
    window.addEventListener("aeromind-auth-logout", clearLocalAuth);
    return () => window.removeEventListener("aeromind-auth-logout", clearLocalAuth);
  }, [utils]);

  const logout = useCallback(async () => {
    let serverConfirmed = false;
    try {
      // Draft cleanup is best-effort and must never delay an explicit logout.
      const workspaceHeaders = anonymousWorkspaceHeaders();
      if (workspaceHeaders) {
        void fetch("/api/local/workspace", {
          method: "DELETE",
          credentials: "include",
          headers: workspaceHeaders,
        }).catch(() => undefined);
      }
      const response = await fetch("/api/auth/oidc/logout", {
        method: "POST",
        credentials: "include",
      });
      serverConfirmed = response.ok;
    } catch {
      // Local sign-out still proceeds below; do not retry login automatically.
    } finally {
      // Clear the Preview token so header-based sessions are logged out too.
      try {
        clearSessionToken();
        localStorage.removeItem("aeromind-blank-workspace-v3");
        localStorage.removeItem("aeromind-workbench-capture");
        localStorage.removeItem(WORKSPACE_KEY_STORAGE_KEY);
        localStorage.removeItem("manus-runtime-user-info");
      } catch {}
      await utils.auth.me.cancel();
      utils.auth.me.setData(undefined, null);
      if (serverConfirmed) {
        await utils.auth.me.invalidate();
        window.dispatchEvent(new Event("aeromind-auth-changed"));
      }
    }
    return serverConfirmed;
  }, [utils]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    // Navigate at this moment only. startLogin() mints the nonce + cookie itself.
    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
