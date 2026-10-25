import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../../components/Icon';
import type { LandingItem, Reward } from '../../types/database';

const QUICK_MENU = [
  { label: 'Barcode', to: '/barcode', icon: 'QrCode' },
  { label: 'Tukar Poin', to: '/rewards', icon: 'Gift' },
  { label: 'Produk', to: '/products', icon: 'ShoppingBag' },
  { label: 'Profil', to: '/profile', icon: 'User' },
];

export default function Home() {
  const { profile } = useAuth();
  const [banner, setBanner] = useState<LandingItem | null>(null);
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xl font-semibold text-slate-800">Hai, {profile.name.split(' ')[0]} 👋</p>
          <p className="text-sm text-slate-500">Selamat datang di Distrik Camong</p>
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

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-slate-700">Menu</p>
        <div className="grid grid-cols-4 gap-3">
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
