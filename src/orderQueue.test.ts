import { describe, expect, it } from 'vitest'
import { enqueueOrder, getQueuedOrders } from './orderQueue'

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
})
