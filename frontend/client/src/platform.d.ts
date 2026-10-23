export {};
declare global {
  interface Window {
    __AEROMIND_INITIAL_LANGUAGE__?: "fr" | "en";
    __MANUS_CONFIG__?: {
      projectId: string; oauthPortalUrl: string; apiUrl: string; apiBrowserKey: string;
      externalOidcEnabled: boolean; externalOidcProvider: string;
    };
  }
}
