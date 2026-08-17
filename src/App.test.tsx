import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

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
})
