import Keycloak from 'keycloak-js'

export const keycloakConfiguration = {
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: 'sparelink',
  clientId: 'sparelink-api',
}

export const keycloak = new Keycloak(keycloakConfiguration)

export function registrationUrl(redirectUri: string) {
  const url = new URL('/realms/sparelink/protocol/openid-connect/registrations', keycloakConfiguration.url)
  url.search = new URLSearchParams({ client_id: keycloakConfiguration.clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid' }).toString()
  return url.toString()
}

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
