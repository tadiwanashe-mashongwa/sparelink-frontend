import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { keycloak } from './auth'
import { enqueueOrder, getQueuedOrders } from './orderQueue'

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

  it('opens a part detail view from the catalogue', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { content: [{
        id: 'part-detail', sku: 'BRK-010', name: 'Premium brake disc', brandName: 'Brembo', categoryName: 'Brakes',
        price: { amount: 9000, currency: 'USD' }, images: [],
      }] } }),
    }))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'View Premium brake disc details' }))

    expect(screen.getByRole('heading', { name: 'Premium brake disc' })).toBeInTheDocument()
    expect(screen.getByText('Part details')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to catalogue' })).toBeInTheDocument()
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

  it('starts Keycloak sign-out when the signed-in customer chooses sign out', async () => {
    const originalAuthentication = keycloak.authenticated
    const logout = vi.spyOn(keycloak, 'logout').mockResolvedValue(undefined)
    Object.assign(keycloak, { authenticated: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(logout).toHaveBeenCalledWith({ redirectUri: window.location.origin })
    Object.assign(keycloak, { authenticated: originalAuthentication })
  })

  it('adds a part to the persisted cart', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { content: [{
        id: 'part-4', sku: 'CLT-001', name: 'Clutch kit', brandName: 'Sachs', categoryName: 'Transmission',
        price: { amount: 15000, currency: 'USD' }, images: [],
      }] } }),
    }))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Add Clutch kit to cart' }))

    expect(screen.getByRole('button', { name: 'Cart (1)' })).toBeInTheDocument()
    expect(localStorage.getItem('sparelink.cart')).toContain('part-4')
  })

  it('shows persisted cart items when the cart is opened', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-5', sku: 'BLT-001', name: 'Alternator belt', brandName: 'Gates', categoryName: 'Belts',
      price: { amount: 2500, currency: 'USD' }, images: [], quantity: 2,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (2)' }))

    expect(screen.getByRole('heading', { name: 'Your cart' })).toBeInTheDocument()
    expect(screen.getByText('Alternator belt × 2')).toBeInTheDocument()
    expect(screen.getByText('USD 50.00')).toBeInTheDocument()
  })

  it('removes an item from the cart', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-remove', sku: 'BLT-002', name: 'Timing belt', brandName: 'Gates', categoryName: 'Belts',
      price: { amount: 3200, currency: 'USD' }, images: [], quantity: 1,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
    await user.click(screen.getByRole('button', { name: 'Remove Timing belt from cart' }))

    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cart (0)' })).toBeInTheDocument()
    expect(localStorage.getItem('sparelink.cart')).toBe('[]')
  })

  it('decreases a cart item quantity without removing the item', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-decrease', sku: 'OIL-001', name: 'Engine oil', brandName: 'Castrol', categoryName: 'Lubricants',
      price: { amount: 1800, currency: 'USD' }, images: [], quantity: 2,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
    await user.click(screen.getByRole('button', { name: 'Decrease Engine oil quantity' }))

    expect(screen.getByText('Engine oil × 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cart (1)' })).toBeInTheDocument()
    expect(localStorage.getItem('sparelink.cart')).toContain('"quantity":1')
  })

  it('shows the total amount before the customer places an order', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-total', sku: 'BRK-010', name: 'Brake disc', brandName: 'Brembo', categoryName: 'Brakes',
      price: { amount: 4500, currency: 'USD' }, images: [], quantity: 2,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (2)' }))

    expect(screen.getByText('Cart total: USD 90.00')).toBeInTheDocument()
  })

  it('queues a cart order locally for later delivery', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-6', sku: 'PMP-001', name: 'Water pump', brandName: 'Aisin', categoryName: 'Cooling',
      price: { amount: 6000, currency: 'USD' }, images: [], quantity: 1,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
    await user.click(screen.getByRole('button', { name: 'Place order' }))

    expect(screen.getByRole('status')).toHaveTextContent('1 order waiting for delivery when you are online.')
    expect(getQueuedOrders()[0]).toMatchObject({ items: [{ partId: 'part-6', quantity: 1 }] })
  })

  it('shows how many orders are waiting for delivery after checkout', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-pending', sku: 'PMP-002', name: 'Fuel pump', brandName: 'Bosch', categoryName: 'Fuel',
      price: { amount: 8000, currency: 'USD' }, images: [], quantity: 1,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
    await user.click(screen.getByRole('button', { name: 'Place order' }))

    expect(screen.getByRole('status')).toHaveTextContent('1 order waiting for delivery when you are online.')
  })

  it('confirms when queued orders are delivered after the customer signs in', async () => {
    const originalAuthentication = keycloak.authenticated
    const originalToken = keycloak.token
    const originalTokenParsed = keycloak.tokenParsed
    Object.assign(keycloak, { authenticated: true, token: 'customer-token', tokenParsed: { sub: 'customer-3' } })
    enqueueOrder([{ partId: 'part-delivered', quantity: 1 }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [] }) }))

    render(<App />)

    expect(await screen.findByText('1 queued order delivered successfully.')).toBeInTheDocument()
    Object.assign(keycloak, { authenticated: originalAuthentication, token: originalToken, tokenParsed: originalTokenParsed })
  })

  it('explains that a queued order will retry when delivery fails', async () => {
    const originalAuthentication = keycloak.authenticated
    const originalToken = keycloak.token
    const originalTokenParsed = keycloak.tokenParsed
    Object.assign(keycloak, { authenticated: true, token: 'customer-token', tokenParsed: { sub: 'customer-4' } })
    enqueueOrder([{ partId: 'part-retry', quantity: 1 }])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<App />)

    expect(await screen.findByText('Your queued order is safe and will retry when you are online.')).toBeInTheDocument()
    Object.assign(keycloak, { authenticated: originalAuthentication, token: originalToken, tokenParsed: originalTokenParsed })
  })

  it('queues only one order when checkout is clicked twice quickly', async () => {
    const user = userEvent.setup()
    localStorage.setItem('sparelink.cart', JSON.stringify([{
      id: 'part-7', sku: 'SUS-001', name: 'Shock absorber', brandName: 'Monroe', categoryName: 'Suspension',
      price: { amount: 7500, currency: 'USD' }, images: [], quantity: 1,
    }]))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { content: [] } }) }))

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
    const placeOrder = screen.getByRole('button', { name: 'Place order' })
    await user.dblClick(placeOrder)

    expect(getQueuedOrders()).toHaveLength(1)
  })

  it('shows the signed-in customer their recent orders', async () => {
    const originalAuthentication = keycloak.authenticated
    const originalToken = keycloak.token
    const originalTokenParsed = keycloak.tokenParsed
    Object.assign(keycloak, {
      authenticated: true,
      token: 'customer-token',
      tokenParsed: { sub: 'customer-1' },
    })
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.startsWith('/api/parts')
      ? { ok: true, json: async () => ({ success: true, data: { content: [] } }) }
      : url.startsWith('/api/orders')
        ? { ok: true, json: async () => ({ content: [{ orderId: 'order-1', customerId: 'customer-1', status: 'PAID', totalAmount: 45.5, createdAt: '2026-08-17T08:00:00Z' }] }) }
        : { ok: true, json: async () => ({ content: [] }) }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'My account' }))

    expect(await screen.findByRole('heading', { name: 'Recent orders' })).toBeInTheDocument()
    expect(screen.getByText('PAID')).toBeInTheDocument()
    expect(screen.getByText('Total: 45.50')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/orders/customer/customer-1?size=5', {
      headers: { Authorization: 'Bearer customer-token' },
    })
    Object.assign(keycloak, {
      authenticated: originalAuthentication,
      token: originalToken,
      tokenParsed: originalTokenParsed,
    })
  })

  it('shows the signed-in customer their payment status', async () => {
    const originalAuthentication = keycloak.authenticated
    const originalToken = keycloak.token
    const originalTokenParsed = keycloak.tokenParsed
    Object.assign(keycloak, { authenticated: true, token: 'customer-token', tokenParsed: { sub: 'customer-2' } })
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.startsWith('/api/parts')
      ? { ok: true, json: async () => ({ success: true, data: { content: [] } }) }
      : url.startsWith('/api/orders')
        ? { ok: true, json: async () => ({ content: [] }) }
        : { ok: true, json: async () => ({ content: [{ id: 'payment-1', orderId: 'order-2', customerId: 'customer-2', amount: 45.5, status: 'PENDING' }] }) }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'My account' }))

    expect(await screen.findByRole('heading', { name: 'Payments' })).toBeInTheDocument()
    expect(screen.getByText('PENDING')).toBeInTheDocument()
    expect(screen.getByText('Amount: 45.50')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/payments/customer/customer-2?size=5', {
      headers: { Authorization: 'Bearer customer-token' },
    })
    Object.assign(keycloak, { authenticated: originalAuthentication, token: originalToken, tokenParsed: originalTokenParsed })
  })

  it('explains when recent orders and payments cannot be loaded', async () => {
    const originalAuthentication = keycloak.authenticated
    const originalToken = keycloak.token
    const originalTokenParsed = keycloak.tokenParsed
    Object.assign(keycloak, { authenticated: true, token: 'customer-token', tokenParsed: { sub: 'customer-errors' } })
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(url.startsWith('/api/parts')
      ? { ok: true, json: async () => ({ success: true, data: { content: [] } }) }
      : { ok: false, json: async () => ({}) })))

    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'My account' }))

    expect(await screen.findByText('Recent orders are unavailable right now. Please try again shortly.')).toBeInTheDocument()
    expect(screen.getByText('Payments are unavailable right now. Please try again shortly.')).toBeInTheDocument()
    Object.assign(keycloak, { authenticated: originalAuthentication, token: originalToken, tokenParsed: originalTokenParsed })
  })

  it('lets a signed-in customer open their account view', async () => {
    const originalAuthentication = keycloak.authenticated
    const originalToken = keycloak.token
    const originalTokenParsed = keycloak.tokenParsed
    Object.assign(keycloak, { authenticated: true, token: 'customer-token', tokenParsed: { sub: 'customer-account' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [], data: { content: [] } }) }))

    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'My account' }))

    expect(await screen.findByRole('heading', { name: 'Recent orders' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Browse parts' })).not.toBeInTheDocument()
    Object.assign(keycloak, { authenticated: originalAuthentication, token: originalToken, tokenParsed: originalTokenParsed })
  })
})
