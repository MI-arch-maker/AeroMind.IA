import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { installLocaleFetch } from "./i18n/requestLocale";
import { bearerHeaders, consumeSessionTokenFromFragment } from "./lib/sessionToken";
import "./index.css";
import "./action-center.css";
import "./aeromind-dynamics.css";

consumeSessionTokenFromFragment();
installLocaleFetch();

const queryClient = new QueryClient();

// P-AUTOLOGIN fix: the previous listener auto-redirected to OIDC login
// whenever a tRPC query/mutation returned the legacy 'Please login (10001)'
// error message. This was a latent logout-bypass: after logout, any
// subsequent tRPC call whose error payload matched would silently redirect
// to Entra, "rejecting" the logout from the user's perspective. AeroMind
// must NOT auto-login without human intervention — the operator must
// explicitly click "Connexion" to (re)authenticate. The listener is now
// disabled (kept as a no-op so the rest of the file's references stay valid).
const redirectToLoginIfUnauthorized = (_error: unknown) => {
  // Intentionally a no-op — see P-AUTOLOGIN fix above.
  return;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const entraHeaders = bearerHeaders();
        if (entraHeaders.Authorization) return entraHeaders;
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { ...entraHeaders, Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return entraHeaders;
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// P3-05 fix — register the service worker now that sw.js excludes /api/ routes
// from the cache (network-only with 503 offline fallback, see sw.js:100).
// Previously the SW was shipped but never registered, making the PWA offline
// shell and caching strategy dead code. Registration is production-only to
// avoid interfering with HMR in development.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] Service worker registration failed:", err);
    });
  });
}
