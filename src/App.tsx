import { useEffect, useState } from 'react'
import { keycloak } from './auth'
import { enqueueOrder, flushQueuedOrders } from './orderQueue'
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
  const [cart, setCart] = useState<CartItem[]>(loadCart)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [orderQueued, setOrderQueued] = useState(false)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  useEffect(() => { localStorage.setItem(CART_CACHE_KEY, JSON.stringify(cart)) }, [cart])

  useEffect(() => {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) return

    const flush = () => void flushQueuedOrders(customerId, keycloak.token!)
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])

  useEffect(() => {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) return
    void fetch(`/api/payments/customer/${customerId}?size=5`, {
      headers: { Authorization: `Bearer ${keycloak.token}` },
    })
      .then(async (response) => response.ok ? response.json() as Promise<PaymentPage> : { content: [] })
      .then((payload) => setPayments(payload.content ?? []))
      .catch(() => setPayments([]))
  }, [])

  function addToCart(part: Part) {
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === part.id)
      if (existing) return currentCart.map((item) => item.id === part.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...currentCart, { ...part, quantity: 1 }]
    })
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

  function queueCartOrder() {
    enqueueOrder(cart.map((item) => ({ partId: item.id, quantity: item.quantity })))
    setCart([])
    setOrderQueued(true)
  }

  const cartCount = cart.reduce((count, item) => count + item.quantity, 0)
  const cartTotal = cart.reduce((total, item) => total + item.price.amount * item.quantity, 0)

  async function loadParts(keyword = '') {
    setIsLoading(true)
    setIsOffline(false)
    try {
      const parameters = new URLSearchParams({ status: 'ACTIVE', size: '20' })
      if (keyword) parameters.set('keyword', keyword)
      const response = await fetch(`/api/parts?${parameters.toString()}`)
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

  useEffect(() => {
    const customerId = keycloak.tokenParsed?.sub
    if (!keycloak.authenticated || !keycloak.token || !customerId) return
    void fetch(`/api/orders/customer/${customerId}?size=5`, {
      headers: { Authorization: `Bearer ${keycloak.token}` },
    })
      .then(async (response) => response.ok ? response.json() as Promise<OrderPage> : { content: [] })
      .then((payload) => setOrders(payload.content ?? []))
      .catch(() => setOrders([]))
  }, [])

  return <main className="app-shell">
    <header className="site-header"><a className="brand" href="/" aria-label="SpareLink home">Spare<span>Link</span></a><div className="header-actions"><p>Find the right part, even on a patchy connection.</p><button className="cart-button" type="button" onClick={() => setIsCartOpen(true)}>Cart ({cartCount})</button>{keycloak.authenticated ? <><span className="signed-in">Signed in</span><button className="sign-out" type="button" onClick={() => void keycloak.logout({ redirectUri: window.location.origin })}>Sign out</button></> : <button className="sign-in" type="button" onClick={() => void keycloak.login()}>Sign in</button>}</div></header>
    {isCartOpen && <aside className="cart-panel" aria-labelledby="cart-heading"><div className="cart-panel-heading"><h2 id="cart-heading">Your cart</h2><button type="button" onClick={() => setIsCartOpen(false)} aria-label="Close cart">×</button></div>{orderQueued && <p className="queued-notice" role="status">Order saved for delivery when you are online.</p>}{cart.length === 0 ? <p>Your cart is empty.</p> : <><ul className="cart-items">{cart.map((item) => <li key={item.id}><div><strong>{item.name} × {item.quantity}</strong><span>{formatPrice({ ...item.price, amount: item.price.amount * item.quantity })}</span></div><div className="cart-item-actions"><button className="remove-from-cart" type="button" onClick={() => decreaseCartItemQuantity(item.id)} aria-label={`Decrease ${item.name} quantity`}>−</button><button className="remove-from-cart" type="button" onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.name} from cart`}>Remove</button></div></li>)}</ul><p className="cart-total">Cart total: {formatPrice({ amount: cartTotal, currency: cart[0].price.currency })}</p><button className="place-order" type="button" onClick={queueCartOrder}>Place order</button></>}</aside>}
    <section className="catalogue" aria-labelledby="catalogue-heading">
      <div className="catalogue-heading"><div><p className="eyebrow">Spare parts marketplace</p><h1 id="catalogue-heading">Browse parts</h1></div><span className="connection-status">{isOffline ? 'Offline catalogue' : 'Live catalogue'}</span></div>
      <form className="search-form" onSubmit={(event) => { event.preventDefault(); void loadParts(search.trim()) }}>
        <label className="sr-only" htmlFor="part-search">Search parts</label>
        <input id="part-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, SKU or brand" />
        <button type="submit">Search</button>
      </form>
      {isOffline && <p className="offline-notice" role="status">Showing saved catalogue data while you are offline.</p>}
      {isLoading && <p role="status">Loading parts…</p>}
      {!isLoading && parts.length === 0 && <p>No parts are available yet. Please reconnect and try again.</p>}
      <div className="part-grid">{parts.map((part) => <article className="part-card" key={part.id}>
        <div className="part-image" aria-hidden="true">{part.images[0] ? <img src={part.images[0].url} alt="" /> : <span>Part image</span>}</div>
        <div className="part-content"><p className="part-meta">{part.brandName} · {part.categoryName}</p><h2>{part.name}</h2><p className="sku">SKU {part.sku}</p><strong>{formatPrice(part.price)}</strong><button className="add-to-cart" type="button" onClick={() => addToCart(part)}>Add {part.name} to cart</button></div>
      </article>)}</div>
    </section>
    {keycloak.authenticated && <section className="recent-orders" aria-labelledby="recent-orders-heading"><h2 id="recent-orders-heading">Recent orders</h2>{orders.length === 0 ? <p>No orders yet.</p> : <ul>{orders.map((order) => <li key={order.orderId}><span>{order.status}</span><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString()}</time></li>)}</ul>}</section>}
    {keycloak.authenticated && <section className="recent-orders" aria-labelledby="payments-heading"><h2 id="payments-heading">Payments</h2>{payments.length === 0 ? <p>No payments yet.</p> : <ul>{payments.map((payment) => <li key={payment.id}><span>{payment.status}</span><span>Order {payment.orderId.slice(0, 8)}</span></li>)}</ul>}</section>}
  </main>
}
