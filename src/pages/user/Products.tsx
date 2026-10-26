import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useCart } from '../../contexts/CartContext';
import { formatRupiah } from '../../lib/currency';
import CartDrawer from '../../components/CartDrawer';
import Icon from '../../components/Icon';
import Countdown from '../../components/Countdown';
import type { Product, Promo } from '../../types/database';

function discountedPrice(price: number, promo: Promo): number {
  const cut = promo.discount_type === 'percent' ? Math.floor((price * (promo.discount_value ?? 0)) / 100) : (promo.discount_value ?? 0);
  return Math.max(price - cut, 0);
}

type Filter = 'all' | 'promo' | 'available';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'promo', label: 'Promo' },
  { key: 'available', label: 'Tersedia' },
];

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [promoByProduct, setPromoByProduct] = useState<Record<string, Promo>>({});
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { items, addItem, updateQuantity, subtotal, itemCount } = useCart();

  // Only per-item discounts show here — bundle/campaign/bogo are buy-this-
  // exact-combo promos, so they live exclusively on the dashboard's Promo
  // Spesial section (with their own direct-checkout flow), never mixed
  // into the plain catalog where they'd block a normal single purchase.
  const loadPromos = async () => {
    const { data } = await supabase
      .from('promo_products')
      .select('product_id, promos!inner(*)')
      .eq('promos.is_active', true)
      .eq('promos.kind', 'discount');

    const now = new Date();
    const counts: Record<string, number> = {};
    const rows = (data as unknown as { product_id: string; promos: Promo }[]) ?? [];
    for (const row of rows) {
      counts[row.promos.id] = (counts[row.promos.id] ?? 0) + 1;
    }

    const map: Record<string, Promo> = {};
    for (const row of rows) {
      const promo = row.promos;
      if (counts[promo.id] !== 1) continue; // more than 1 product = campaign, not a per-item promo
      if (promo.starts_at && new Date(promo.starts_at) > now) continue;
      if (promo.ends_at && new Date(promo.ends_at) < now) continue;
      map[row.product_id] = promo;
    }
    setPromoByProduct(map);
  };

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProducts((data as Product[]) ?? []);
        setLoading(false);
      });
    loadPromos();
  }, []);

  const quantityInCart = (productId: string) => items.find((i) => i.product.id === productId)?.quantity ?? 0;

  const visibleProducts = products.filter((product) => {
    if (search.trim() && !product.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter === 'promo' && !promoByProduct[product.id]) return false;
    if (filter === 'available' && product.stock !== null && product.stock <= 0) return false;
    return true;
  });

  const effectiveProduct = (product: Product) => {
    const promo = promoByProduct[product.id];
    return promo ? { ...product, price: discountedPrice(product.price, promo) } : product;
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Produk</h1>
        <p className="text-sm text-slate-500">Pesan dari sini, bayar di kasir saat ambil.</p>
      </div>

      <div className="relative">
        <Icon
          name="Search"
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk..."
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 transition-colors focus:border-brand-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-green-100"
        />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-brand-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat produk...</p>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="ShoppingBag" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Belum ada produk tersedia.</p>
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="Search" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Tidak ada produk yang cocok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visibleProducts.map((product) => {
            const outOfStock = product.stock !== null && product.stock <= 0;
            const lowStock = !outOfStock && product.stock !== null && product.stock <= 5;
            const inCart = quantityInCart(product.id);
            const promo = promoByProduct[product.id];
            const salePrice = promo ? discountedPrice(product.price, promo) : null;
            return (
              <div
                key={product.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)]"
              >
                <div className="relative">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-slate-50 text-xs text-slate-300">
                      Tanpa foto
                    </div>
                  )}
                  {promo && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-red px-2 py-0.5 text-[11px] font-bold text-white shadow">
                      {promo.discount_type === 'percent' ? `-${promo.discount_value}%` : `-${formatRupiah(promo.discount_value ?? 0)}`}
                    </span>
                  )}
                  {lowStock && (
                    <span className="absolute bottom-0 left-0 right-0 bg-amber-500/90 px-2 py-1 text-center text-[10px] font-semibold text-white">
                      Sisa {product.stock}
                    </span>
                  )}

                  <div className="absolute -bottom-4 right-2">
                    {inCart > 0 ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-white px-1 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                        <button
                          onClick={() => updateQuantity(product.id, inCart - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-4 text-center text-xs font-semibold text-slate-800">{inCart}</span>
                        <button
                          onClick={() => addItem(effectiveProduct(product))}
                          disabled={outOfStock}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-green-600 text-white hover:bg-brand-green-700 disabled:opacity-40"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addItem(effectiveProduct(product))}
                        disabled={outOfStock}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-green-600 text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-brand-green-700 disabled:bg-slate-300"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 p-3 pt-5">
                  <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                  {salePrice !== null ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-brand-red">{formatRupiah(salePrice)}</span>
                      <span className="text-[11px] text-slate-400 line-through">{formatRupiah(product.price)}</span>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-brand-green-700">{formatRupiah(product.price)}</p>
                  )}
                  {promo?.ends_at && (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-brand-red">
                      <Icon name="History" size={11} />
                      <Countdown target={promo.ends_at} onExpire={loadPromos} />
                    </p>
                  )}
                  {outOfStock && <p className="text-[11px] font-medium text-slate-400">Stok habis</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {itemCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-4 bottom-20 z-30 flex items-center justify-between rounded-2xl bg-brand-green-600 px-5 py-4 text-white shadow-[0_8px_24px_rgba(31,92,52,0.35)] transition-transform active:scale-[0.98]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-green-700">
              {itemCount}
            </span>
            Keranjang · {itemCount} Pesanan
          </span>
          <span className="text-sm font-bold">{formatRupiah(subtotal)}</span>
        </button>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
