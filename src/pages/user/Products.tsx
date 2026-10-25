import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useCart } from '../../contexts/CartContext';
import { formatRupiah } from '../../lib/currency';
import CartDrawer from '../../components/CartDrawer';
import type { Product } from '../../types/database';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [bump, setBump] = useState(false);
  const { items, addItem, itemCount } = useCart();

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
  }, []);

  const quantityInCart = (productId: string) => items.find((i) => i.product.id === productId)?.quantity ?? 0;

  const handleAdd = (product: Product) => {
    addItem(product);
    setBump(true);
    setTimeout(() => setBump(false), 300);
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Produk</h1>
        <p className="text-sm text-slate-500">Pesan dari sini, bayar di kasir saat ambil.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat produk...</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada produk tersedia.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {products.map((product) => {
            const outOfStock = product.stock !== null && product.stock <= 0;
            const inCart = quantityInCart(product.id);
            return (
              <div key={product.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-300">
                    Tanpa foto
                  </div>
                )}
                <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                <p className="text-sm font-semibold text-brand-green-700">{formatRupiah(product.price)}</p>
                <button
                  onClick={() => handleAdd(product)}
                  disabled={outOfStock}
                  className="rounded-lg bg-brand-green-600 py-1.5 text-xs font-medium text-white hover:bg-brand-green-700 disabled:opacity-40"
                >
                  {outOfStock ? 'Stok Habis' : inCart > 0 ? `+ Tambah (${inCart} di keranjang)` : 'Tambah ke Keranjang'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {itemCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className={`fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-brand-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-green-700 ${
            bump ? 'animate-bounce-in' : ''
          }`}
        >
          <ShoppingBag size={18} />
          Keranjang
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-green-700">
            {itemCount}
          </span>
        </button>
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
