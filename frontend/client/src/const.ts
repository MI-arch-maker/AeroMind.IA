
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// AeroMind authenticates only through its configured Microsoft Entra OIDC tenant.
// No local password or alternate Manus OAuth account can bypass the Entra allowlist.
export const startLogin = () => {
  if (window.__MANUS_CONFIG__?.externalOidcEnabled) {
    window.location.assign("/api/auth/oidc/login");
    return;
  }
  window.location.assign("/?external_login=failed");
};
