import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { formatRupiah } from '../../lib/currency';
import Icon from '../../components/Icon';
import BarcodeDisplay from '../../components/BarcodeDisplay';
import Countdown from '../../components/Countdown';
import type { LandingItem, Promo, Reward } from '../../types/database';

const QUICK_MENU = [
  { label: 'Tukar Poin', to: '/rewards', icon: 'Gift' },
  { label: 'Produk', to: '/products', icon: 'ShoppingBag' },
  { label: 'Profil', to: '/profile', icon: 'User' },
];

type DashboardPromo = Promo & {
  promo_products: { product_id: string; products: { name: string; image_url: string | null; price: number } }[];
};

function discountedPrice(price: number, promo: Promo): number {
  const cut = promo.discount_type === 'percent' ? Math.floor((price * (promo.discount_value ?? 0)) / 100) : (promo.discount_value ?? 0);
  return Math.max(price - cut, 0);
}

export default function Home() {
  const { profile } = useAuth();
  const [banner, setBanner] = useState<LandingItem | null>(null);
  const [specialPromos, setSpecialPromos] = useState<DashboardPromo[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('landing_items')
      .select('*')
      .eq('section', 'promo')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setBanner((data as LandingItem[] | null)?.[0] ?? null));

    supabase
      .from('promos')
      .select('*, promo_products(product_id, products(name, image_url, price))')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const now = new Date();
        const rows = (data as DashboardPromo[]) ?? [];
        setSpecialPromos(
          rows.filter((p) => {
            if (p.promo_products.length === 0) return false;
            if (p.starts_at && new Date(p.starts_at) > now) return false;
            if (p.ends_at && new Date(p.ends_at) < now) return false;
            return true;
          })
        );
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      let query = supabase
        .from('rewards')
        .select('*')
        .eq('is_active', true)
        .order('point_cost', { ascending: true })
        .limit(8);
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
      query.then(({ data }) => {
        setRewards((data as Reward[]) ?? []);
        setLoading(false);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <BarcodeDisplay memberCode={profile.member_code} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-semibold text-slate-800">Hai, {profile.name.split(' ')[0]} 👋</p>
          <p className="truncate text-sm text-slate-500">Selamat datang di Distrik Camong</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-green-50 px-3 py-1.5 text-sm font-semibold text-brand-green-700">
          <Icon name="Star" size={14} />
          {profile.points_balance}
        </div>
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
          placeholder="Cari reward..."
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 transition-colors focus:border-brand-green-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-green-100"
        />
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-green-600 to-brand-green-700 p-5 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -right-2 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-1">
          {banner ? (
            <>
              {banner.title && <p className="font-classic text-lg font-bold">{banner.title}</p>}
              {banner.description && <p className="text-sm text-brand-green-50/90">{banner.description}</p>}
            </>
          ) : (
            <>
              <p className="font-classic text-lg font-bold">Kumpulkan poin tiap belanja susu!</p>
              <p className="text-sm text-brand-green-50/90">Tukarkan poin kamu dengan reward menarik.</p>
            </>
          )}
          <Link
            to={banner?.link_url ?? '/rewards'}
            target={banner?.link_url ? '_blank' : undefined}
            rel={banner?.link_url ? 'noopener noreferrer' : undefined}
            className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-brand-green-700"
          >
            Lihat Reward
            <Icon name="ChevronRight" size={14} />
          </Link>
        </div>
      </div>

      {specialPromos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-700">Promo Spesial</p>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {specialPromos.map((promo) => {
              const linkedProducts = promo.promo_products;
              const thumb = promo.image_url ?? linkedProducts[0]?.products?.image_url ?? null;
              // Only a plain per-item discount (1 product) sends members to the
              // normal catalog+cart — every other kind (bundle, bogo, campaign)
              // is a buy-this-exact-combo deal, so it gets its own direct-buy
              // page instead of being mixed into the plain product grid.
              const isDirectCheckout = !(promo.kind === 'discount' && linkedProducts.length === 1);
              return (
                <Link
                  key={promo.id}
                  to={isDirectCheckout ? `/promos/${promo.id}` : '/products'}
                  className="w-44 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)]"
                >
                  <div className="relative">
                    {thumb ? (
                      <img src={thumb} alt={promo.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-brand-red/10 text-brand-red">
                        <Icon name="Tag" size={24} />
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-red px-2 py-0.5 text-[11px] font-bold text-white shadow">
                      {promo.kind === 'bundle' && 'Bundle'}
                      {promo.kind === 'bogo' && 'Gratis'}
                      {promo.kind === 'discount' &&
                        (promo.discount_type === 'percent' ? `-${promo.discount_value}%` : `-${formatRupiah(promo.discount_value ?? 0)}`)}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium text-slate-700">{promo.title}</p>

                    {promo.kind === 'bundle' && (
                      <>
                        <div className="mt-0.5 flex items-baseline gap-1.5">
                          <span className="text-base font-bold text-brand-red">{formatRupiah(promo.bundle_price ?? 0)}</span>
                          <span className="text-[11px] text-slate-400 line-through">
                            {formatRupiah(linkedProducts.reduce((sum, lp) => sum + lp.products.price, 0))}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-400">{linkedProducts.length} produk sekaligus</p>
                      </>
                    )}

                    {promo.kind === 'bogo' && (
                      <>
                        <p className="mt-0.5 text-base font-bold text-brand-red">
                          Hemat{' '}
                          {formatRupiah(
                            (linkedProducts.find((lp) => lp.product_id === promo.bogo_get_product_id)?.products.price ?? 0) *
                              promo.bogo_get_qty
                          )}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          Beli {promo.bogo_buy_qty}× gratis {promo.bogo_get_qty}×{' '}
                          {linkedProducts.find((lp) => lp.product_id === promo.bogo_get_product_id)?.products?.name ?? ''}
                        </p>
                      </>
                    )}

                    {promo.kind === 'discount' && linkedProducts.length === 1 && (
                      <>
                        <div className="mt-0.5 flex items-baseline gap-1.5">
                          <span className="text-base font-bold text-brand-red">
                            {formatRupiah(discountedPrice(linkedProducts[0].products.price, promo))}
                          </span>
                          <span className="text-[11px] text-slate-400 line-through">
                            {formatRupiah(linkedProducts[0].products.price)}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-400">{linkedProducts[0].products?.name}</p>
                      </>
                    )}

                    {promo.kind === 'discount' && linkedProducts.length > 1 && (
                      <>
                        <p className="mt-0.5 text-base font-bold text-brand-red">
                          Mulai{' '}
                          {formatRupiah(Math.min(...linkedProducts.map((lp) => discountedPrice(lp.products.price, promo))))}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">{linkedProducts.length} produk</p>
                      </>
                    )}

                    {promo.ends_at && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-brand-red">
                        <Icon name="History" size={11} />
                        <Countdown target={promo.ends_at} />
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-slate-700">Menu</p>
        <div className="grid grid-cols-3 gap-3">
          {QUICK_MENU.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-600">
                <Icon name={item.icon} size={20} />
              </div>
              <span className="text-center text-[11px] font-medium text-slate-600">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Reward</p>
          <Link to="/rewards" className="flex items-center gap-0.5 text-xs font-medium text-brand-green-700">
            Lihat Semua
            <Icon name="ChevronRight" size={14} />
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">Memuat...</p>
        ) : rewards.length === 0 ? (
          <p className="text-sm text-slate-400">
            {search ? 'Reward tidak ditemukan.' : 'Belum ada reward tersedia.'}
          </p>
        ) : (
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {rewards.map((reward) => (
              <Link
                key={reward.id}
                to="/rewards"
                className="w-36 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)]"
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
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium text-slate-700">{reward.name}</p>
                  <p className="text-xs font-semibold text-brand-green-700">{reward.point_cost} poin</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
