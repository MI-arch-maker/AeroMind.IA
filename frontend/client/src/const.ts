
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Le flux de connexion générique conserve Entra; la console Super-Admin expose
// aussi le parcours local mot de passe + TOTP avec inscription préautorisée.
export const startLogin = () => {
  if (window.__MANUS_CONFIG__?.externalOidcEnabled) {
    window.location.assign("/api/auth/oidc/login");
    return;
  }
  window.location.assign("/?external_login=failed");
};
