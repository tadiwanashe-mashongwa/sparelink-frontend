import { useEffect, useState } from 'react'
import { keycloak } from './auth'

const CATALOGUE_CACHE_KEY = 'sparelink.catalogue.parts'
const CART_CACHE_KEY = 'sparelink.cart'
type Money = { amount: number; currency: string }
type Part = { id: string; sku: string; name: string; brandName: string; categoryName: string; price: Money; images: Array<{ url: string }> }
type CartItem = Part & { quantity: number }
type CatalogueResponse = { data: { content: Part[] } }

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

  useEffect(() => { localStorage.setItem(CART_CACHE_KEY, JSON.stringify(cart)) }, [cart])

  function addToCart(part: Part) {
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === part.id)
      if (existing) return currentCart.map((item) => item.id === part.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...currentCart, { ...part, quantity: 1 }]
    })
  }

  const cartCount = cart.reduce((count, item) => count + item.quantity, 0)

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
  return <main className="app-shell">
    <header className="site-header"><a className="brand" href="/" aria-label="SpareLink home">Spare<span>Link</span></a><div className="header-actions"><p>Find the right part, even on a patchy connection.</p><button className="cart-button" type="button" onClick={() => setIsCartOpen(true)}>Cart ({cartCount})</button>{keycloak.authenticated ? <span className="signed-in">Signed in</span> : <button className="sign-in" type="button" onClick={() => void keycloak.login()}>Sign in</button>}</div></header>
    {isCartOpen && <aside className="cart-panel" aria-labelledby="cart-heading"><div className="cart-panel-heading"><h2 id="cart-heading">Your cart</h2><button type="button" onClick={() => setIsCartOpen(false)} aria-label="Close cart">×</button></div>{cart.length === 0 ? <p>Your cart is empty.</p> : <ul className="cart-items">{cart.map((item) => <li key={item.id}><div><strong>{item.name} × {item.quantity}</strong><span>{formatPrice({ ...item.price, amount: item.price.amount * item.quantity })}</span></div></li>)}</ul>}</aside>}
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
  </main>
}
