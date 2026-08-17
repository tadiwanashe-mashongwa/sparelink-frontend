import { describe, expect, it } from 'vitest'
import { keycloakConfiguration } from './auth'

describe('Keycloak configuration', () => {
  it('uses the SpareLink public client and realm', () => {
    expect(keycloakConfiguration).toEqual({
      url: 'http://localhost:8080',
      realm: 'sparelink',
      clientId: 'sparelink-api',
    })
  })
})
