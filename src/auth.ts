import Keycloak from 'keycloak-js'

export const keycloakConfiguration = {
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: 'sparelink',
  clientId: 'sparelink-api',
}

export const keycloak = new Keycloak(keycloakConfiguration)

export async function initializeAuthentication() {
  await keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
  })
}
