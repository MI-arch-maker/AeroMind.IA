import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { installLocaleFetch } from "./i18n/requestLocale";
import { installResizeObserverPolyfill } from "./lib/resizeObserverPolyfill";
import { bearerHeaders, consumeSessionTokenFromFragment } from "./lib/sessionToken";
import "./index.css";
import "./action-center.css";
import "./aeromind-dynamics.css";

// react-use-measure (utilisé par la scène 3D du centre de simulation) lève
// une exception au montage si l’API native manque dans un WebView/iframe.
// Installer le polyfill avant createRoot().render() évite un crash global.
installResizeObserverPolyfill();

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

// Retire legacy cache-first service workers after a deployment. Do not create
// a new registration: the current shell and content-hashed assets use HTTP
// caching only, and re-registering after the worker unregisters would create
// an install/uninstall cycle on every page load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.update())))
      .catch(err => console.warn("[PWA] Service worker retirement update failed:", err));
  });
}
