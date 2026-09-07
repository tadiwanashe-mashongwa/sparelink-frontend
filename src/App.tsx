import { useEffect, useState } from 'react'
import { keycloak, registrationUrl } from './auth'
import { apiUrl } from './api'
import { enqueueOrder, flushQueuedOrders, getQueuedOrders } from './orderQueue'
import './cart.css'

const CATALOGUE_CACHE_KEY = 'sparelink.catalogue.parts'
const CART_CACHE_KEY = 'sparelink.cart'
type Money = { amount: number; currency: string }
type Part = { id: string; sku: string; name: string; brandName: string; categoryName: string; price: Money; images: Array<{ url: string }> }
type CartItem = Part & { quantity: number }
type CatalogueResponse = { data: { content: Part[] } }
type OrderSummary = { orderId: string; status: string; totalAmount: number; createdAt: string }
type OrderPage = { content: OrderSummary[] }
type Payment = { id: string; orderId: string; amount: number; status: string }
type PaymentPage = { content: Payment[] }

function formatPrice({ amount, currency }: Money) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount / 100)
}

function formatServiceAmount(amount: number) {
  return amount.toFixed(2)
}

function describeOrderStatus(status: string) {
  const descriptions: Record<string, string> = {
    CREATED: 'Order received',
    RESERVED: 'Parts reserved',
    PAYMENT_PENDING: 'Payment is being prepared',
    PAID: 'Payment complete',
    CANCELLED: 'Order cancelled',
  }
  return descriptions[status] ?? 'Order processing'
}

function loadCachedParts(): Part[] {
  const cached = localStorage.getItem(CATALOGUE_CACHE_KEY)
  if (!cached) return []
  try { return JSON.parse(cached) as Part[] } catch { localStorage.removeItem(CATALOGUE_CACHE_KEY); return [] }
}

function loadCart(): CartItem[] {
  const cached = localStorage.getItem(CART_CACHE_KEY)
  if (!cached) return []
  try { return JSON.parse(cached) as CartItem[] } catch { localStorage.removeItem(CART_CACHE_KEY); return [] }
}

export default function App() {
  const [parts, setParts] = useState<Part[]>([])
  const [isOffline, setIsOffline] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeView, setActiveView] = useState<'browse' | 'account'>('browse')
  const [selectedPart, setSelectedPart] = useState<Part | null>(null)
  const [availability, setAvailability] = useState<Record<string, number | null>>({})
  const [cart, setCart] = useState<CartItem[]>(loadCart)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [queuedOrderCount, setQueuedOrderCount] = useState(getQueuedOrders().length)
  const [deliveredOrderCount, setDeliveredOrderCount] = useState(0)
  const [hasQueuedOrderDeliveryFailure, setHasQueuedOrderDeliveryFailure] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [ordersUnavailable, setOrdersUnavailable] = useState(false)
  const [paymentsUnavailable, setPaymentsUnavailable] = useState(false)
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [isLoadingPayments, setIsLoadingPayments] = useState(false)

  useEffect(() => { localStorage.setItem(CART_CACHE_KEY, JSON.stringify(cart)) }, [cart])

  useEffect(() => {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) return

    const flush = async () => {
      const queuedBeforeDelivery = getQueuedOrders().length
      const delivered = await flushQueuedOrders(customerId, keycloak.token!)
      const queuedAfterDelivery = getQueuedOrders().length
      setQueuedOrderCount(queuedAfterDelivery)
      if (delivered > 0) setDeliveredOrderCount(delivered)
      setHasQueuedOrderDeliveryFailure(queuedBeforeDelivery > 0 && queuedAfterDelivery > 0)
    }
    void flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])

  useEffect(() => { void loadPayments() }, [])

  function addToCart(part: Part) {
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === part.id)
      if (existing) return currentCart.map((item) => item.id === part.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...currentCart, { ...part, quantity: 1 }]
    })
  }

  function selectPart(part: Part) {
    setSelectedPart(part)
    setAvailability((current) => ({ ...current, [part.id]: null }))
    void fetch(apiUrl(`/api/inventory/stock/${part.id}`))
      .then(async (response) => {
        if (!response.ok) throw new Error('Inventory request failed')
        return response.json() as Promise<number>
      })
      .then((stock) => setAvailability((current) => ({ ...current, [part.id]: stock })))
      .catch(() => setAvailability((current) => ({ ...current, [part.id]: null })))
  }

  function removeFromCart(partId: string) {
    setCart((currentCart) => currentCart.filter((item) => item.id !== partId))
  }

  function decreaseCartItemQuantity(partId: string) {
    setCart((currentCart) => currentCart.flatMap((item) => {
      if (item.id !== partId) return [item]
      return item.quantity === 1 ? [] : [{ ...item, quantity: item.quantity - 1 }]
    }))
  }

  function increaseCartItemQuantity(partId: string) {
    setCart((currentCart) => currentCart.map((item) => item.id === partId ? { ...item, quantity: item.quantity + 1 } : item))
  }

  function startCheckout() {
    if (!keycloak.authenticated) {
      void keycloak.login({ redirectUri: window.location.origin })
      return
    }
    setIsCartOpen(false)
    setIsCheckoutOpen(true)
  }

  async function submitCartOrder() {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) {
      void keycloak.login({ redirectUri: window.location.origin })
      return
    }
    if (isSubmittingOrder) return
    setIsSubmittingOrder(true)
    const items = cart.map((item) => ({ partId: item.id, quantity: item.quantity }))
    try {
      const response = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${keycloak.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ customerId, items }),
      })
      if (!response.ok) throw new Error('Order request failed')
      setCart([])
      setOrderPlaced(true)
      await Promise.all([loadOrders(), loadPayments()])
      setActiveView('account')
    } catch {
      enqueueOrder(items)
      setCart([])
      setQueuedOrderCount(getQueuedOrders().length)
    } finally {
      setIsCheckoutOpen(false)
      setIsSubmittingOrder(false)
    }
  }

  const cartCount = cart.reduce((count, item) => count + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + item.price.amount * item.quantity, 0)

  async function loadParts(keyword = '') {
    setIsLoading(true)
    setIsOffline(false)
    try {
      const parameters = new URLSearchParams({ status: 'ACTIVE', size: '20' })
      if (keyword) parameters.set('keyword', keyword)
      const response = await fetch(apiUrl(`/api/parts?${parameters.toString()}`))
      if (!response.ok) throw new Error('Catalogue request failed')
      const payload = (await response.json()) as CatalogueResponse
      setParts(payload.data.content)
      if (!keyword) localStorage.setItem(CATALOGUE_CACHE_KEY, JSON.stringify(payload.data.content))
    } catch {
      const cachedParts = loadCachedParts()
      setParts(cachedParts)
      setIsOffline(cachedParts.length > 0)
    } finally { setIsLoading(false) }
  }

  useEffect(() => {
    void loadParts()
  }, []) // The first load must occur once; searches are explicit user actions.

  useEffect(() => { void loadOrders() }, [])

  async function loadOrders() {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) return
    setIsLoadingOrders(true)
    try {
      const response = await fetch(apiUrl(`/api/orders/customer/${customerId}?size=5`), { headers: { Authorization: `Bearer ${keycloak.token}` } })
      if (!response.ok) throw new Error('Orders request failed')
      const payload = await response.json() as OrderPage
      setOrders(payload.content ?? [])
      setOrdersUnavailable(false)
    } catch {
      setOrders([])
      setOrdersUnavailable(true)
    } finally { setIsLoadingOrders(false) }
  }

  async function loadPayments() {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) return
    setIsLoadingPayments(true)
    try {
      const response = await fetch(apiUrl(`/api/payments/customer/${customerId}?size=5`), { headers: { Authorization: `Bearer ${keycloak.token}` } })
      if (!response.ok) throw new Error('Payments request failed')
      const payload = await response.json() as PaymentPage
      setPayments(payload.content ?? [])
      setPaymentsUnavailable(false)
    } catch {
      setPayments([])
      setPaymentsUnavailable(true)
    } finally { setIsLoadingPayments(false) }
  }

  function refreshAccountActivity() {
    void Promise.all([loadOrders(), loadPayments()])
  }

  return <main className="app-shell">
    <header className="site-header"><a className="brand" href="/" aria-label="SpareLink home" onClick={(event) => { event.preventDefault(); setActiveView('browse') }}>Spare<span>Link</span></a><nav className="primary-navigation" aria-label="Primary navigation"><button type="button" className={activeView === 'browse' ? 'active' : ''} onClick={() => setActiveView('browse')}>Browse</button>{keycloak.authenticated && <button type="button" className={activeView === 'account' ? 'active' : ''} onClick={() => setActiveView('account')}>My account</button>}</nav><div className="header-actions"><p>Find the right part, even on a patchy connection.</p><button className="cart-button" type="button" onClick={() => setIsCartOpen(true)}>Cart ({cartCount})</button>{keycloak.authenticated ? <><span className="signed-in">Signed in</span><button className="sign-out" type="button" onClick={() => void keycloak.logout({ redirectUri: window.location.origin })}>Sign out</button></> : <><a className="create-account" href={registrationUrl(window.location.origin)}>Create account</a><button className="sign-in" type="button" onClick={() => void keycloak.login()}>Sign in</button></>}</div></header>
    {deliveredOrderCount > 0 && <p className="delivery-notice" role="status">{deliveredOrderCount} queued {deliveredOrderCount === 1 ? 'order' : 'orders'} delivered successfully.</p>}
    {hasQueuedOrderDeliveryFailure && <p className="retry-notice" role="status">Your queued order is safe and will retry when you are online.</p>}
    {orderPlaced && <p className="delivery-notice" role="status">Order placed successfully.</p>}
    {queuedOrderCount > 0 && <p className="queued-notice" role="status">{queuedOrderCount} {queuedOrderCount === 1 ? 'order' : 'orders'} waiting for delivery when you are online.</p>}
    {isCheckoutOpen && <section className="checkout-view" aria-labelledby="checkout-heading"><button className="back-to-catalogue" type="button" onClick={() => { setIsCheckoutOpen(false); setIsCartOpen(true) }}>Back to cart</button><p className="eyebrow">Checkout</p><h1 id="checkout-heading">Review your order</h1><ul className="checkout-items">{cart.map((item) => <li key={item.id}>{item.name} × {item.quantity}<span>{formatPrice({ ...item.price, amount: item.price.amount * item.quantity })}</span></li>)}</ul><p className="cart-total">Order total: {formatPrice({ amount: cartTotal, currency: cart[0].price.currency })}</p><button className="place-order" type="button" disabled={isSubmittingOrder} onClick={() => void submitCartOrder()}>{isSubmittingOrder ? 'Placing order…' : 'Confirm order'}</button></section>}
    {isCartOpen && <aside className="cart-panel" aria-labelledby="cart-heading"><div className="cart-panel-heading"><h2 id="cart-heading">Your cart</h2><button type="button" onClick={() => setIsCartOpen(false)} aria-label="Close cart">×</button></div>{queuedOrderCount > 0 && <p className="queued-notice" role="status">{queuedOrderCount} {queuedOrderCount === 1 ? 'order' : 'orders'} waiting for delivery when you are online.</p>}{cart.length === 0 ? <p>Your cart is empty.</p> : <><ul className="cart-items">{cart.map((item) => <li key={item.id}><div><strong>{item.name} × {item.quantity}</strong><span>{formatPrice({ ...item.price, amount: item.price.amount * item.quantity })}</span></div><div className="cart-item-actions"><button className="remove-from-cart" type="button" onClick={() => decreaseCartItemQuantity(item.id)} aria-label={`Decrease ${item.name} quantity`}>−</button><button className="increase-cart-item" type="button" onClick={() => increaseCartItemQuantity(item.id)} aria-label={`Increase ${item.name} quantity`}>+</button><button className="remove-from-cart" type="button" onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.name} from cart`}>Remove</button></div></li>)}</ul><p className="cart-total">Cart total: {formatPrice({ amount: cartTotal, currency: cart[0].price.currency })}</p><button className="place-order" type="button" onClick={startCheckout}>Checkout</button></>}</aside>}
    {activeView === 'browse' && <section className="catalogue" aria-labelledby="catalogue-heading">
      <div className="catalogue-heading"><div><p className="eyebrow">Spare parts marketplace</p><h1 id="catalogue-heading">Browse parts</h1></div><span className="connection-status">{isOffline ? 'Offline catalogue' : 'Live catalogue'}</span></div>
      {selectedPart ? <section className="part-details" aria-labelledby="part-details-heading"><button className="back-to-catalogue" type="button" onClick={() => setSelectedPart(null)}>Back to catalogue</button><p className="eyebrow">Part details</p><h1 id="part-details-heading">{selectedPart.name}</h1><p className="part-meta">{selectedPart.brandName} · {selectedPart.categoryName}</p><p className="sku">SKU {selectedPart.sku}</p><strong>{formatPrice(selectedPart.price)}</strong><p role="status">{availability[selectedPart.id] === null ? 'Checking availability…' : availability[selectedPart.id] === 0 ? 'Out of stock' : `${availability[selectedPart.id]} in stock`}</p><button className="add-to-cart" type="button" disabled={availability[selectedPart.id] === 0} onClick={() => addToCart(selectedPart)}>Add {selectedPart.name} to cart</button></section> : <><form className="search-form" onSubmit={(event) => { event.preventDefault(); void loadParts(search.trim()) }}>
        <label className="sr-only" htmlFor="part-search">Search parts</label>
        <input id="part-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, SKU or brand" />
        <button type="submit">Search</button>
      </form>
      {isOffline && <p className="offline-notice" role="status">Showing saved catalogue data while you are offline.</p>}
      {isLoading && <p role="status">Loading parts…</p>}
      {!isLoading && parts.length === 0 && <p>No parts are available yet. Please reconnect and try again.</p>}
      <div className="part-grid">{parts.map((part) => <article className="part-card" key={part.id}>
        <div className="part-image" aria-hidden="true">{part.images[0] ? <img src={part.images[0].url} alt="" /> : <span>Part image</span>}</div>
        <div className="part-content"><p className="part-meta">{part.brandName} · {part.categoryName}</p><h2>{part.name}</h2><p className="sku">SKU {part.sku}</p><strong>{formatPrice(part.price)}</strong><button className="view-details" type="button" onClick={() => selectPart(part)} aria-label={`View ${part.name} details`}>View details</button><button className="add-to-cart" type="button" onClick={() => addToCart(part)}>Add {part.name} to cart</button></div>
      </article>)}</div></>}
    </section>}
    {keycloak.authenticated && activeView === 'account' && <section className="account-view" aria-labelledby="account-heading"><p className="eyebrow">Customer account</p><h1 id="account-heading">Your SpareLink activity</h1><button className="refresh-activity" type="button" onClick={refreshAccountActivity}>Refresh activity</button><section className="recent-orders" aria-labelledby="recent-orders-heading"><h2 id="recent-orders-heading">Recent orders</h2>{isLoadingOrders ? <p role="status">Loading recent orders…</p> : ordersUnavailable ? <p>Recent orders are unavailable right now. Please try again shortly.</p> : orders.length === 0 ? <p>No orders yet.</p> : <ul>{orders.map((order) => <li key={order.orderId}><span>{order.status}</span><span className="order-progress">{describeOrderStatus(order.status)}</span><span>Total: {formatServiceAmount(order.totalAmount)}</span><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString()}</time></li>)}</ul>}</section><section className="recent-orders" aria-labelledby="payments-heading"><h2 id="payments-heading">Payments</h2>{isLoadingPayments ? <p role="status">Loading payments…</p> : paymentsUnavailable ? <p>Payments are unavailable right now. Please try again shortly.</p> : payments.length === 0 ? <p>No payments yet.</p> : <ul>{payments.map((payment) => <li key={payment.id}><span>{payment.status}</span><span>Amount: {formatServiceAmount(payment.amount)}</span><span>Order {payment.orderId.slice(0, 8)}</span></li>)}</ul>}</section></section>}
  </main>
}
