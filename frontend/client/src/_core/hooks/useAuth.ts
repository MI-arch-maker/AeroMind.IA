import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
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

  const logout = useCallback(async () => {
    try {
      // A browser draft must never survive a completed session. Delete the
      // anonymous server slot before removing its browser snapshot.
      const workspaceHeaders = anonymousWorkspaceHeaders();
      if (workspaceHeaders) {
        await fetch("/api/local/workspace", {
          method: "DELETE",
          credentials: "include",
          headers: workspaceHeaders,
        }).catch(() => undefined);
      }
      await fetch("/api/auth/oidc/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      // Clear the Preview auto-login token mirrored into sessionStorage, so
      // header-based sessions (Safari ITP / WebView) are logged out too. The
      // The backend clears both the session and pending OIDC state cookies.
      try {
        sessionStorage.removeItem("manus-cookie");
        sessionStorage.removeItem("aeromind-entra-session");
        localStorage.removeItem("aeromind-blank-workspace-v3");
        localStorage.removeItem("aeromind-workbench-capture");
        localStorage.removeItem(WORKSPACE_KEY_STORAGE_KEY);
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.dispatchEvent(new Event("aeromind-auth-changed"));
    }
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
