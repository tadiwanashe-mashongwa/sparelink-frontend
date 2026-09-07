import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiUrl } from './api'

describe('apiUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses same-origin API paths by default', () => {
    expect(apiUrl('/api/parts')).toBe('/api/parts')
  })

  it('uses the configured public API base URL for hosted builds', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.sparelink.example/')
    expect(apiUrl('/api/parts')).toBe('https://api.sparelink.example/api/parts')
  })
})
