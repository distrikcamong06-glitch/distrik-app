import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplet, Leaf, Truck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { formatRupiah } from '../lib/currency';
import Icon from '../components/Icon';
import Countdown from '../components/Countdown';
import logo from '../assets/logo.png';
import type { LandingItem, Promo } from '../types/database';

const FEATURES = [
  { icon: Droplet, title: 'Susu Segar', text: 'Diproses tiap hari, tanpa disimpan lama.' },
  { icon: Leaf, title: 'Tanpa Pengawet', text: 'Murni dari peternakan terpercaya.' },
  { icon: Truck, title: 'Selalu Tersedia', text: 'Stok baru datang setiap hari ke toko.' },
];

type DashboardPromo = Promo & {
  promo_products: { product_id: string; products: { name: string; image_url: string | null; price: number } }[];
};

function discountedPrice(price: number, promo: Promo): number {
  const cut = promo.discount_type === 'percent' ? Math.floor((price * (promo.discount_value ?? 0)) / 100) : (promo.discount_value ?? 0);
  return Math.max(price - cut, 0);
}

export default function Landing() {
  const { profile } = useAuth();
  const [promos, setPromos] = useState<LandingItem[]>([]);
  const [gallery, setGallery] = useState<LandingItem[]>([]);
  const [specialPromos, setSpecialPromos] = useState<DashboardPromo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('landing_items')
      .select('*')
      .eq('is_active', true)
      .order('order', { ascending: true })
      .then(({ data }) => {
        const items = (data as LandingItem[]) ?? [];
        setPromos(items.filter((i) => i.section === 'promo'));
        setGallery(items.filter((i) => i.section === 'gallery'));
        setLoading(false);
      });

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

  const primaryCtaTo = profile ? '/app' : '/register';
  const primaryCtaLabel = profile ? 'Buka Aplikasi' : 'Gabung Jadi Member';

  return (
    <div className="min-h-screen bg-brand-cream text-slate-800">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <img src={logo} alt="Distrik Camong" className="h-10 w-auto sm:h-12" />
        <nav className="flex items-center gap-2 sm:gap-3">
          {profile ? (
            <Link
              to="/app"
              className="rounded-full bg-brand-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-green-700 sm:text-sm"
            >
              Buka Aplikasi
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full border border-brand-green-600 px-4 py-2 text-xs font-semibold text-brand-green-600 hover:bg-white sm:text-sm"
              >
                Masuk
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-brand-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-green-700 sm:text-sm"
              >
                Daftar Member
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-10 text-center sm:px-6 sm:py-16">
        <p className="font-classic text-xs uppercase tracking-[0.3em] text-brand-red sm:text-sm">
          UMKM Susu Segar
        </p>
        <h1 className="font-classic mt-3 text-3xl font-bold leading-tight text-brand-green-600 sm:text-5xl">
          Susu Segar, Langsung dari Distrik Camong
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-slate-600 sm:text-base">
          Diproses higienis, tanpa pengawet, tersedia segar tiap hari di toko. Jadi member dan kumpulkan poin
          setiap kali belanja.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={primaryCtaTo}
            className="rounded-full bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-red-dark"
          >
            {primaryCtaLabel}
          </Link>
          {(promos.length > 0 || specialPromos.length > 0) && (
            <a
              href="#promo"
              className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-white"
            >
              Lihat Promo
            </a>
          )}
        </div>
      </section>

      <div className="mx-auto h-px w-24 bg-brand-red/40" />

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {FEATURES.map(({ icon: FeatureIcon, title, text }) => (
            <div key={title} className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-600/10 text-brand-green-600">
                <FeatureIcon size={22} />
              </div>
              <p className="font-classic text-base font-bold text-slate-800">{title}</p>
              <p className="text-xs text-slate-500 sm:text-sm">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="bg-white py-10 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-classic text-2xl font-bold text-brand-green-600 sm:text-3xl">Tentang Kami</h2>
          <div className="mx-auto my-3 h-px w-16 bg-brand-red" />
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            Distrik Camong lahir dari kecintaan pada susu segar berkualitas. Setiap produk kami berasal dari
            peternakan terpercaya, diproses dengan standar kebersihan tinggi, dan sampai ke tangan pelanggan dalam
            kondisi terbaik. Sebagai bagian dari komunitas, kami juga menghadirkan program member dengan poin
            loyalti yang bisa ditukar berbagai reward menarik.
          </p>
        </div>
      </section>

      {/* Promo */}
      {!loading && (promos.length > 0 || specialPromos.length > 0) && (
        <section id="promo" className="py-10 sm:py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="font-classic text-2xl font-bold text-brand-red sm:text-3xl">Promo</h2>
              <div className="mx-auto my-3 h-px w-16 bg-brand-green-600" />
            </div>

            {specialPromos.length > 0 && (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {specialPromos.map((promo) => {
                  const linkedProducts = promo.promo_products;
                  const thumb = promo.image_url ?? linkedProducts[0]?.products?.image_url ?? null;
                  const isDirectCheckout = !(promo.kind === 'discount' && linkedProducts.length === 1);
                  const to = profile ? (isDirectCheckout ? `/promos/${promo.id}` : '/products') : '/register';
                  return (
                    <Link
                      key={promo.id}
                      to={to}
                      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="relative">
                        {thumb ? (
                          <img src={thumb} alt={promo.title} loading="lazy" className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center bg-brand-red/10 text-brand-red">
                            <Icon name="Tag" size={28} />
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full bg-brand-red px-2.5 py-1 text-xs font-bold text-white shadow">
                          {promo.kind === 'bundle' && 'Bundle'}
                          {promo.kind === 'bogo' && 'Gratis'}
                          {promo.kind === 'discount' &&
                            (promo.discount_type === 'percent'
                              ? `-${promo.discount_value}%`
                              : `-${formatRupiah(promo.discount_value ?? 0)}`)}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-4">
                        <p className="font-classic font-bold text-slate-800">{promo.title}</p>

                        {promo.kind === 'bundle' && (
                          <>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-bold text-brand-red">{formatRupiah(promo.bundle_price ?? 0)}</span>
                              <span className="text-xs text-slate-400 line-through">
                                {formatRupiah(linkedProducts.reduce((sum, lp) => sum + lp.products.price, 0))}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{linkedProducts.length} produk sekaligus</p>
                          </>
                        )}

                        {promo.kind === 'bogo' && (
                          <>
                            <p className="text-lg font-bold text-brand-red">
                              Hemat{' '}
                              {formatRupiah(
                                (linkedProducts.find((lp) => lp.product_id === promo.bogo_get_product_id)?.products.price ?? 0) *
                                  promo.bogo_get_qty
                              )}
                            </p>
                            <p className="text-xs text-slate-400">
                              Beli {promo.bogo_buy_qty}× gratis {promo.bogo_get_qty}×{' '}
                              {linkedProducts.find((lp) => lp.product_id === promo.bogo_get_product_id)?.products?.name ?? ''}
                            </p>
                          </>
                        )}

                        {promo.kind === 'discount' && linkedProducts.length === 1 && (
                          <>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-lg font-bold text-brand-red">
                                {formatRupiah(discountedPrice(linkedProducts[0].products.price, promo))}
                              </span>
                              <span className="text-xs text-slate-400 line-through">
                                {formatRupiah(linkedProducts[0].products.price)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">{linkedProducts[0].products?.name}</p>
                          </>
                        )}

                        {promo.kind === 'discount' && linkedProducts.length > 1 && (
                          <>
                            <p className="text-lg font-bold text-brand-red">
                              Mulai{' '}
                              {formatRupiah(Math.min(...linkedProducts.map((lp) => discountedPrice(lp.products.price, promo))))}
                            </p>
                            <p className="text-xs text-slate-400">{linkedProducts.length} produk</p>
                          </>
                        )}

                        {promo.description && <p className="text-sm text-slate-500">{promo.description}</p>}

                        {promo.ends_at && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-brand-red">
                            <Icon name="History" size={12} />
                            <Countdown target={promo.ends_at} />
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {promos.length > 0 && (
              <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${specialPromos.length > 0 ? 'mt-8' : 'mt-6'}`}>
                {promos.map((promo) => {
                  const card = (
                    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                      <img
                        src={promo.image_url}
                        alt={promo.title ?? ''}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      {(promo.title || promo.description) && (
                        <div className="flex flex-1 flex-col gap-1 p-4">
                          {promo.title && <p className="font-classic font-bold text-slate-800">{promo.title}</p>}
                          {promo.description && <p className="text-sm text-slate-500">{promo.description}</p>}
                        </div>
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
          </div>
        </section>
      )}

      {/* Gallery */}
      {!loading && gallery.length > 0 && (
        <section className="bg-white py-10 sm:py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="font-classic text-2xl font-bold text-brand-green-600 sm:text-3xl">Galeri</h2>
              <div className="mx-auto my-3 h-px w-16 bg-brand-red" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {gallery.map((item) => (
                <img
                  key={item.id}
                  src={item.image_url}
                  alt={item.title ?? ''}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Membership CTA */}
      <section className="bg-brand-green-600 py-10 text-center text-white sm:py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="font-classic text-2xl font-bold sm:text-3xl">Member Dapat Poin, Poin Bisa Ditukar</h2>
          <p className="mt-3 text-sm text-brand-green-50 sm:text-base">
            Tiap belanja di toko dapat poin otomatis. Kumpulkan dan tukar dengan reward menarik.
          </p>
          <Link
            to={primaryCtaTo}
            className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-green-600 hover:bg-brand-cream"
          >
            {primaryCtaLabel}
          </Link>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-slate-400">
        <img src={logo} alt="Distrik Camong" className="mx-auto mb-2 h-8 w-auto opacity-70" />
        <p>&copy; {new Date().getFullYear()} Distrik Camong. Semua hak cipta dilindungi.</p>
      </footer>
    </div>
  );
}
