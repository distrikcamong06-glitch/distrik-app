import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatRupiah } from '../../lib/currency';
import { checkPendingPickup, type PendingPickup } from '../../lib/pendingPickup';
import Icon from '../../components/Icon';
import Countdown from '../../components/Countdown';
import OrderSuccessModal from '../../components/OrderSuccessModal';
import type { Order, Product, Promo } from '../../types/database';

type LinkedProduct = { product_id: string; products: Product };

export default function PromoCheckout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [linked, setLinked] = useState<LinkedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState(1);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [pending, setPending] = useState<PendingPickup>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('promos')
      .select('*, promo_products(product_id, products(*))')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) {
          setLoading(false);
          return;
        }
        const row = data as Promo & { promo_products: LinkedProduct[] };
        setPromo(row);
        setLinked(row.promo_products);
        if (row.kind === 'discount') {
          const initial: Record<string, number> = {};
          for (const lp of row.promo_products) initial[lp.product_id] = 1;
          setQuantities(initial);
        }
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!profile) return;
    checkPendingPickup(profile.id).then(setPending);
  }, [profile]);

  if (loading) return <p className="text-sm text-slate-400">Memuat...</p>;
  if (!promo) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
        <Icon name="Tag" size={28} className="text-slate-300" />
        <p className="text-sm text-slate-400">Promo tidak ditemukan atau sudah berakhir.</p>
      </div>
    );
  }

  const isBundle = promo.kind === 'bundle';
  const isBogo = promo.kind === 'bogo';

  const buyProduct = linked.find((lp) => lp.product_id === promo.bogo_buy_product_id)?.products ?? null;
  const getProduct = linked.find((lp) => lp.product_id === promo.bogo_get_product_id)?.products ?? null;
  const sameBogoProduct = promo.bogo_buy_product_id !== null && promo.bogo_buy_product_id === promo.bogo_get_product_id;

  const discountedUnitPrice = (product: Product) => {
    const cut =
      promo.discount_type === 'percent'
        ? Math.floor((product.price * (promo.discount_value ?? 0)) / 100)
        : (promo.discount_value ?? 0);
    return Math.max(product.price - cut, 0);
  };

  const bundleTotalNormal = linked.reduce((sum, lp) => sum + lp.products.price, 0);
  const total = isBundle
    ? (promo.bundle_price ?? 0) * sets
    : isBogo
      ? sets * promo.bogo_buy_qty * (buyProduct?.price ?? 0)
      : linked.reduce((sum, lp) => sum + discountedUnitPrice(lp.products) * (quantities[lp.product_id] ?? 0), 0);

  const canSubmit = isBundle || isBogo ? sets > 0 : Object.values(quantities).some((q) => q > 0);

  const handlePlace = async () => {
    setPlacing(true);
    setError(null);

    const items = isBundle
      ? linked.map((lp) => ({ product_id: lp.product_id, quantity: sets }))
      : isBogo
        ? sameBogoProduct
          ? [{ product_id: promo.bogo_buy_product_id as string, quantity: sets * (promo.bogo_buy_qty + promo.bogo_get_qty) }]
          : [
              { product_id: promo.bogo_buy_product_id as string, quantity: sets * promo.bogo_buy_qty },
              { product_id: promo.bogo_get_product_id as string, quantity: sets * promo.bogo_get_qty },
            ]
        : linked
            .filter((lp) => (quantities[lp.product_id] ?? 0) > 0)
            .map((lp) => ({ product_id: lp.product_id, quantity: quantities[lp.product_id] }));

    const { data, error } = await supabase.rpc('place_order', { p_items: items, p_promo_id: null });
    setPlacing(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccessOrder(data as Order);
    setPending({ type: 'order' });
  };

  if (successOrder) {
    return (
      <OrderSuccessModal
        order={successOrder}
        onClose={() => {
          setSuccessOrder(null);
          navigate('/orders/history');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{promo.title}</h1>
        {promo.description && <p className="text-sm text-slate-500">{promo.description}</p>}
        {promo.ends_at && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-red">
            <Icon name="History" size={12} />
            Berakhir dalam <Countdown target={promo.ends_at} />
          </p>
        )}
      </div>

      {isBundle ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-semibold text-slate-700">Isi Bundle</p>
          {linked.map((lp) => (
            <div key={lp.product_id} className="flex items-center gap-3">
              {lp.products.image_url ? (
                <img src={lp.products.image_url} alt={lp.products.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{lp.products.name}</p>
                <p className="text-xs text-slate-400">{formatRupiah(lp.products.price)}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
            <span>Harga normal</span>
            <span className="line-through">{formatRupiah(bundleTotalNormal)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold text-brand-red">
            <span>Harga bundle</span>
            <span>{formatRupiah(promo.bundle_price ?? 0)}</span>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-600">Jumlah paket</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSets((s) => Math.max(1, s - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm font-medium">{sets}</span>
              <button
                onClick={() => setSets((s) => s + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : isBogo ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-semibold text-slate-700">Beli Gratis</p>

          <div className="flex items-center gap-3">
            {buyProduct?.image_url ? (
              <img src={buyProduct.image_url} alt={buyProduct.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                Beli {promo.bogo_buy_qty}× {buyProduct?.name}
              </p>
              <p className="text-xs text-slate-400">{formatRupiah(buyProduct?.price ?? 0)}/pcs</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {getProduct?.image_url ? (
              <img src={getProduct.image_url} alt={getProduct.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                Gratis {promo.bogo_get_qty}× {getProduct?.name}
              </p>
              <p className="text-xs font-semibold text-brand-red">Rp0</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-600">Jumlah paket</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSets((s) => Math.max(1, s - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm font-medium">{sets}</span>
              <button
                onClick={() => setSets((s) => s + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <p className="text-sm font-semibold text-slate-700">Pilih Jumlah</p>
          {linked.map((lp) => {
            const qty = quantities[lp.product_id] ?? 0;
            const outOfStock = lp.products.stock !== null && lp.products.stock <= 0;
            return (
              <div key={lp.product_id} className="flex items-center gap-3">
                {lp.products.image_url ? (
                  <img src={lp.products.image_url} alt={lp.products.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{lp.products.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 line-through">{formatRupiah(lp.products.price)}</span>
                    <span className="text-xs font-semibold text-brand-red">{formatRupiah(discountedUnitPrice(lp.products))}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setQuantities((q) => ({ ...q, [lp.product_id]: Math.max(0, (q[lp.product_id] ?? 0) - 1) }))}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-5 text-center text-sm">{qty}</span>
                  <button
                    onClick={() => setQuantities((q) => ({ ...q, [lp.product_id]: (q[lp.product_id] ?? 0) + 1 }))}
                    disabled={outOfStock || (lp.products.stock !== null && qty >= lp.products.stock)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between text-base font-semibold text-slate-800">
          <span>Total bayar di kasir</span>
          <span>{formatRupiah(total)}</span>
        </div>
        {pending && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Kamu masih punya {pending.type === 'order' ? 'pesanan' : 'penukaran reward'} yang menunggu diambil. Ambil
            dulu sebelum pesan lagi.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          onClick={handlePlace}
          disabled={!canSubmit || placing || !!pending}
          className="mt-3 w-full rounded-lg bg-brand-green-600 py-3 text-sm font-semibold text-white hover:bg-brand-green-700 disabled:opacity-60"
        >
          {placing ? 'Memproses...' : 'Pesan Sekarang'}
        </button>
      </div>
    </div>
  );
}
