import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { keycloak } from './auth'

describe('App', () => {
  it('shows catalogue parts returned by the catalogue service', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          content: [
            {
              id: 'part-1',
              sku: 'BRK-001',
              name: 'Front brake pad set',
              brandName: 'Brembo',
              categoryName: 'Brakes',
              price: { amount: 4500, currency: 'USD' },
              images: [],
            },
          ],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Front brake pad set' })).toBeInTheDocument()
    expect(screen.getByText('Brembo · Brakes')).toBeInTheDocument()
    expect(screen.getByText('USD 45.00')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/parts?status=ACTIVE&size=20')
  })

  it('shows cached parts when the catalogue cannot be reached', async () => {
    localStorage.setItem(
      'sparelink.catalogue.parts',
      JSON.stringify([
        {
          id: 'part-2',
          sku: 'FLT-001',
          name: 'Oil filter',
          brandName: 'Mann',
          categoryName: 'Filters',
          price: { amount: 1200, currency: 'USD' },
          images: [],
        },
      ]),
    )
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Oil filter' })).toBeInTheDocument()
    expect(screen.getByText('Showing saved catalogue data while you are offline.')).toBeInTheDocument()
  })

  it('searches the catalogue by part name', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { content: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        success: true,
        data: { content: [{
          id: 'part-3', sku: 'PAD-001', name: 'Brake pad', brandName: 'Bosch', categoryName: 'Brakes',
          price: { amount: 3000, currency: 'USD' }, images: [],
        }] },
      }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findByText('No parts are available yet. Please reconnect and try again.')
    await user.type(screen.getByRole('searchbox', { name: 'Search parts' }), 'brake pad')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('heading', { name: 'Brake pad' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/parts?status=ACTIVE&size=20&keyword=brake+pad')
  })

  it('starts Keycloak sign-in when the customer chooses sign in', async () => {
    const user = userEvent.setup()
    const login = vi.spyOn(keycloak, 'login').mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(login).toHaveBeenCalledOnce()
  })
})
