import { describe, expect, it, vi } from 'vitest'
import { enqueueOrder, flushQueuedOrders, getQueuedOrders } from './orderQueue'

describe('order queue', () => {
  it('stores an order locally with a durable idempotency key', () => {
    enqueueOrder([{ partId: 'part-1', quantity: 2 }])

    expect(getQueuedOrders()).toEqual([
      expect.objectContaining({
        items: [{ partId: 'part-1', quantity: 2 }],
        idempotencyKey: expect.any(String),
      }),
    ])
  })

  it('submits queued orders with their original idempotency key', async () => {
    const queued = enqueueOrder([{ partId: 'part-1', quantity: 2 }])
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await flushQueuedOrders('customer-1', 'access-token')

    expect(fetchMock).toHaveBeenCalledWith('/api/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': queued.idempotencyKey,
      },
      body: JSON.stringify({ customerId: 'customer-1', items: queued.items }),
    })
    expect(getQueuedOrders()).toEqual([])
  })
})
