import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { formatRupiah } from '../../lib/currency';
import BarcodeDisplay from '../../components/BarcodeDisplay';
import type { LandingItem, Product, Reward } from '../../types/database';

export default function Barcode() {
  const { profile } = useAuth();
  const [promos, setPromos] = useState<LandingItem[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    supabase
      .from('landing_items')
      .select('*')
      .eq('section', 'promo')
      .eq('is_active', true)
      .order('order', { ascending: true })
      .limit(8)
      .then(({ data }) => setPromos((data as LandingItem[]) ?? []));

    supabase
      .from('rewards')
      .select('*')
      .eq('is_active', true)
      .order('point_cost', { ascending: true })
      .limit(6)
      .then(({ data }) => setRewards((data as Reward[]) ?? []));

    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, []);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg font-semibold text-slate-800">Hai, {profile.name.split(' ')[0]}! 👋</p>

      {promos.length > 0 && (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {promos.map((promo) => {
            const card = (
              <div className="w-64 shrink-0 snap-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <img src={promo.image_url} alt={promo.title ?? ''} loading="lazy" className="aspect-[16/9] w-full object-cover" />
                {promo.title && (
                  <p className="truncate px-3 py-2 text-sm font-medium text-slate-700">{promo.title}</p>
                )}
              </div>
            );
            return promo.link_url ? (
              <a key={promo.id} href={promo.link_url} target="_blank" rel="noopener noreferrer">
                {card}
              </a>
            ) : (
              <div key={promo.id}>{card}</div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl bg-brand-green-600 p-5 text-white">
        <p className="text-sm opacity-80">Saldo Poin</p>
        <p className="text-3xl font-semibold">{profile.points_balance}</p>
      </div>

      <BarcodeDisplay memberCode={profile.member_code} />

      {rewards.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Reward Unggulan</p>
            <Link to="/rewards" className="text-xs font-medium text-brand-green-700">
              Lihat semua
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {rewards.map((reward) => (
              <Link
                key={reward.id}
                to="/rewards"
                className="w-32 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                {reward.image_url ? (
                  <img
                    src={reward.image_url}
                    alt={reward.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-slate-50 text-[10px] text-slate-300">
                    Tanpa foto
                  </div>
                )}
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-slate-700">{reward.name}</p>
                  <p className="text-xs font-semibold text-brand-green-700">{reward.point_cost} poin</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {products.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Produk Pilihan</p>
            <Link to="/products" className="text-xs font-medium text-brand-green-700">
              Pesan sekarang
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {products.map((product) => (
              <Link
                key={product.id}
                to="/products"
                className="w-32 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-slate-50 text-[10px] text-slate-300">
                    Tanpa foto
                  </div>
                )}
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-slate-700">{product.name}</p>
                  <p className="text-xs font-semibold text-brand-green-700">{formatRupiah(product.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
