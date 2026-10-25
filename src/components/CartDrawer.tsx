import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { formatRupiah } from '../lib/currency';
import OrderSuccessModal from './OrderSuccessModal';
import type { Order, Promo } from '../types/database';

export default function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  const { items, updateQuantity, removeItem, subtotal, clear } = useCart();
  const [allPromos, setAllPromos] = useState<Promo[]>([]);
  const [usedCounts, setUsedCounts] = useState<Record<string, number>>({});
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!open || !profile) return;
    supabase
      .from('promos')
      .select('*')
      .eq('is_active', true)
      .then(({ data }) => setAllPromos((data as Promo[]) ?? []));
    supabase
      .from('promo_redemptions')
      .select('promo_id')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        for (const row of data ?? []) counts[row.promo_id] = (counts[row.promo_id] ?? 0) + 1;
        setUsedCounts(counts);
      });
  }, [open, profile]);

  const eligiblePromos = useMemo(() => {
    const now = new Date();
    return allPromos.filter((p) => {
      if ((usedCounts[p.id] ?? 0) >= p.max_uses_per_user) return false;
      if (p.starts_at && new Date(p.starts_at) > now) return false;
      if (p.ends_at && new Date(p.ends_at) < now) return false;
      if (p.min_order_amount && subtotal < p.min_order_amount) return false;
      return true;
    });
  }, [allPromos, usedCounts, subtotal]);

  const selectedPromo = eligiblePromos.find((p) => p.id === selectedPromoId) ?? null;
  const discount = selectedPromo
    ? Math.min(
        subtotal,
        selectedPromo.discount_type === 'percent'
          ? Math.floor((subtotal * selectedPromo.discount_value) / 100)
          : selectedPromo.discount_value
      )
    : 0;
  const total = subtotal - discount;

  const handlePlaceOrder = async () => {
    setPlacing(true);
    setError(null);

    const { data, error } = await supabase.rpc('place_order', {
      p_items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      p_promo_id: selectedPromoId,
    });

    setPlacing(false);
    if (error) {
      setError(error.message);
      return;
    }

    setSuccessOrder(data as Order);
    clear();
    setSelectedPromoId(null);
  };

  if (successOrder) {
    return (
      <OrderSuccessModal
        order={successOrder}
        onClose={() => {
          setSuccessOrder(null);
          onClose();
        }}
      />
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50" onClick={onClose}>
      <div
        className="animate-slide-up flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <p className="text-base font-semibold text-slate-800">Keranjang</p>
          <button onClick={onClose} aria-label="Tutup" className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Keranjang masih kosong.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex items-center gap-3">
                  {product.image_url ? (
                    <img src={product.image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">{formatRupiah(product.price)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => updateQuantity(product.id, quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-5 text-center text-sm">{quantity}</span>
                    <button
                      onClick={() => updateQuantity(product.id, quantity + 1)}
                      disabled={product.stock !== null && quantity >= product.stock}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => removeItem(product.id)}
                      aria-label="Hapus"
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {eligiblePromos.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-600">Pakai promo?</p>
                  <button
                    onClick={() => setSelectedPromoId(null)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${
                      selectedPromoId === null
                        ? 'border-brand-green-500 bg-brand-green-50 text-brand-green-700'
                        : 'border-slate-200 text-slate-500'
                    }`}
                  >
                    Tanpa promo
                  </button>
                  {eligiblePromos.map((promo) => (
                    <button
                      key={promo.id}
                      onClick={() => setSelectedPromoId(promo.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs ${
                        selectedPromoId === promo.id
                          ? 'border-brand-green-500 bg-brand-green-50 text-brand-green-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="font-medium">{promo.title}</span> —{' '}
                      {promo.discount_type === 'percent' ? `${promo.discount_value}%` : formatRupiah(promo.discount_value)}{' '}
                      off
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-slate-100 p-4">
            <div className="mb-3 flex flex-col gap-1 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-brand-green-700">
                  <span>Diskon</span>
                  <span>-{formatRupiah(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold text-slate-800">
                <span>Total bayar di kasir</span>
                <span>{formatRupiah(total)}</span>
              </div>
            </div>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={handlePlaceOrder}
              disabled={placing}
              className="w-full rounded-lg bg-brand-green-600 py-3 text-sm font-semibold text-white hover:bg-brand-green-700 disabled:opacity-60"
            >
              {placing ? 'Memproses...' : 'Pesan Sekarang'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
