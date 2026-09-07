const ORDER_QUEUE_KEY = 'sparelink.order-queue'

export type QueuedOrderItem = { partId: string; quantity: number }
export type QueuedOrder = {
  idempotencyKey: string
  items: QueuedOrderItem[]
  queuedAt: string
}

export function getQueuedOrders(): QueuedOrder[] {
  const stored = localStorage.getItem(ORDER_QUEUE_KEY)
  if (!stored) return []
  try { return JSON.parse(stored) as QueuedOrder[] } catch { localStorage.removeItem(ORDER_QUEUE_KEY); return [] }
}

export function enqueueOrder(items: QueuedOrderItem[]): QueuedOrder {
  const order = { idempotencyKey: crypto.randomUUID(), items, queuedAt: new Date().toISOString() }
  localStorage.setItem(ORDER_QUEUE_KEY, JSON.stringify([...getQueuedOrders(), order]))
  return order
}

export async function flushQueuedOrders(customerId: string, accessToken: string) {
  const remaining: QueuedOrder[] = []
  let deliveredOrderCount = 0

  for (const order of getQueuedOrders()) {
    try {
      const response = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': order.idempotencyKey,
        },
        body: JSON.stringify({ customerId, items: order.items }),
      })
      if (!response.ok) remaining.push(order)
      else deliveredOrderCount += 1
    } catch {
      remaining.push(order)
    }
  }

  localStorage.setItem(ORDER_QUEUE_KEY, JSON.stringify(remaining))
  return deliveredOrderCount
}
import { apiUrl } from './api'
