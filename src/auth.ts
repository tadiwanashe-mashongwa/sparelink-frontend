import Keycloak from 'keycloak-js'

export const keycloakConfiguration = {
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: 'sparelink',
  clientId: 'sparelink-api',
}

export const keycloak = new Keycloak(keycloakConfiguration)

export async function refreshAuthenticationToken() {
  await keycloak.updateToken(30)
}

export async function initializeAuthentication() {
  keycloak.onTokenExpired = () => {
    void refreshAuthenticationToken().catch(() => keycloak.login({ redirectUri: window.location.origin }))
  }
  await keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
  })
}
