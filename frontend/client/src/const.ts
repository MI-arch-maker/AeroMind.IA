
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Le flux de connexion générique conserve Entra; la console Super-Admin expose
// aussi le parcours local mot de passe + TOTP avec inscription préautorisée.
export const startLogin = () => {
  // Le backend reste l’autorité de configuration et retournera une erreur
  // explicite si Render n’a pas encore chargé les variables Entra.
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`/api/auth/oidc/login?return_to=${encodeURIComponent(returnTo || "/")}`);
};
