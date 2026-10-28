
export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Le flux de connexion générique conserve Entra; la console Super-Admin expose
// aussi le parcours local mot de passe + TOTP avec inscription préautorisée.
export const startLogin = () => {
  // Le backend reste l’autorité de configuration et retournera une erreur
  // explicite si Render n’a pas encore chargé les variables Entra.
  window.location.assign("/api/auth/oidc/login");
};

// V6.2 — Connexion développement (bypass OIDC pour développement local).
// Crée un utilisateur de dev, signe un jeton de session, et rafraîchit la page.
export const devLogin = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/auth/dev-login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return false;
    const data = await response.json();
    if (data?.token) {
      sessionStorage.setItem("aeromind-entra-session", data.token);
    }
    // Rafraîchir la page pour que authQuery re-fetch avec le nouveau cookie
    window.location.reload();
    return true;
  } catch {
    return false;
  }
};

// V6.2 — Vérifier si la connexion développement est disponible.
export const checkDevLoginAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/auth/dev-status", { credentials: "include" });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.devLoginAvailable === true;
  } catch {
    return false;
  }
};
