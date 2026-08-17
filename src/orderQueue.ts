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
