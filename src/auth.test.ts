import { describe, expect, it } from 'vitest'
import { keycloak, keycloakConfiguration, refreshAuthenticationToken } from './auth'

describe('Keycloak configuration', () => {
  it('uses the SpareLink public client and realm', () => {
    expect(keycloakConfiguration).toEqual({
      url: 'http://keycloak:8080',
      realm: 'sparelink',
      clientId: 'sparelink-api',
    })
  })

  it('refreshes the Keycloak token before it expires', async () => {
    const updateToken = vi.spyOn(keycloak, 'updateToken').mockResolvedValue(false)

    await refreshAuthenticationToken()

    expect(updateToken).toHaveBeenCalledWith(30)
  })
})
