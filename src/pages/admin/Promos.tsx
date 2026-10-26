import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { compressImage } from '../../lib/compressImage';
import { formatRupiah } from '../../lib/currency';
import type { DiscountType, Product, Promo, PromoKind, PromoTargetMode } from '../../types/database';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import Countdown from '../../components/Countdown';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

type FormKind = 'checkout' | 'item' | 'campaign' | 'bundle' | 'bogo';

const KIND_PICKER: { kind: FormKind; label: string; description: string; icon: string }[] = [
  { kind: 'item', label: 'Promo per Item', description: 'Diskon otomatis untuk satu produk tertentu.', icon: 'Tag' },
  { kind: 'campaign', label: 'Campaign', description: 'Satu diskon untuk beberapa produk sekaligus.', icon: 'Layers' },
  { kind: 'bundle', label: 'Bundle (harga paket)', description: 'Gabungkan 2+ produk jadi satu harga total.', icon: 'Package' },
  { kind: 'bogo', label: 'Beli A Gratis B', description: 'Beli produk tertentu, dapat produk lain gratis.', icon: 'Gift' },
  { kind: 'checkout', label: 'Kode Checkout', description: 'Kode diskon yang dipilih member sendiri saat checkout.', icon: 'Receipt' },
];

const TARGET_MODE_OPTIONS: { mode: PromoTargetMode; label: string }[] = [
  { mode: 'all', label: 'Semua orang' },
  { mode: 'percent', label: 'Persentase member (acak tapi konsisten)' },
  { mode: 'top_spenders', label: 'Member dengan transaksi terbanyak' },
  { mode: 'new_users', label: 'Member baru' },
  { mode: 'specific', label: 'Member tertentu (pilih manual)' },
  { mode: 'random', label: 'Acak sejumlah member' },
];

const emptyForm = {
  id: null as string | null,
  title: '',
  description: '',
  image_url: '',
  discount_type: 'percent' as DiscountType,
  discount_value: '',
  min_order_amount: '',
  max_uses_per_user: '',
  starts_at: '',
  ends_at: '',
  productIds: [] as string[],
  bundle_price: '',
  bogo_buy_product_id: '',
  bogo_buy_qty: '1',
  bogo_get_product_id: '',
  bogo_get_qty: '1',
  target_mode: 'all' as PromoTargetMode,
  target_percent: '',
  target_count: '',
  target_new_user_days: '30',
  targetMemberIds: [] as string[],
  is_active: true,
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function kindOf(promo: Promo, linkedCount: number): FormKind {
  if (promo.kind === 'bundle') return 'bundle';
  if (promo.kind === 'bogo') return 'bogo';
  if (linkedCount === 0) return 'checkout';
  if (linkedCount === 1) return 'item';
  return 'campaign';
}

type Member = { id: string; name: string; member_code: string };

export default function PromosAdmin() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [linkedProducts, setLinkedProducts] = useState<Record<string, string[]>>({});
  const [targetMembers, setTargetMembers] = useState<Record<string, string[]>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<FormKind>('item');
  const [form, setForm] = useState(emptyForm);
  const [productSearch, setProductSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPromos = async () => {
    setLoading(true);
    const [{ data: promoData }, { data: productData }, { data: memberData }] = await Promise.all([
      supabase
        .from('promos')
        .select('*, promo_products(product_id), promo_target_members(user_id)')
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name', { ascending: true }),
      supabase.from('profiles').select('id, name, member_code').eq('role', 'user').order('name', { ascending: true }),
    ]);

    const linked: Record<string, string[]> = {};
    const targeted: Record<string, string[]> = {};
    for (const row of (promoData as (Promo & {
      promo_products: { product_id: string }[];
      promo_target_members: { user_id: string }[];
    })[]) ?? []) {
      linked[row.id] = row.promo_products.map((pp) => pp.product_id);
      targeted[row.id] = row.promo_target_members.map((tm) => tm.user_id);
    }

    setPromos((promoData as Promo[]) ?? []);
    setLinkedProducts(linked);
    setTargetMembers(targeted);
    setProducts((productData as Product[]) ?? []);
    setMembers((memberData as Member[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadPromos();
  }, []);

  const productName = (id: string | null) => products.find((p) => p.id === id)?.name ?? '(produk dihapus)';
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase()));
  const filteredMembers = members.filter((m) => {
    const q = memberSearch.trim().toLowerCase();
    return m.name.toLowerCase().includes(q) || m.member_code.toLowerCase().includes(q);
  });

  const targetSummary = (promo: Promo) => {
    switch (promo.target_mode) {
      case 'percent':
        return `🎯 ${promo.target_percent ?? 0}% member`;
      case 'top_spenders':
        return `🎯 Top ${promo.target_count ?? 0} spender`;
      case 'new_users':
        return `🎯 Member baru (${promo.target_new_user_days ?? 30} hari)`;
      case 'specific':
        return `🎯 ${(targetMembers[promo.id] ?? []).length} member terpilih`;
      case 'random':
        return `🎯 ${(targetMembers[promo.id] ?? []).length} member acak`;
      default:
        return null;
    }
  };

  const openPicker = () => {
    setError(null);
    setPickerOpen(true);
  };

  const chooseKind = (kind: FormKind) => {
    setForm(emptyForm);
    setFormKind(kind);
    setProductSearch('');
    setMemberSearch('');
    setError(null);
    setPickerOpen(false);
    setFormOpen(true);
  };

  const startEdit = (promo: Promo) => {
    const linked = linkedProducts[promo.id] ?? [];
    setForm({
      id: promo.id,
      title: promo.title,
      description: promo.description ?? '',
      image_url: promo.image_url ?? '',
      discount_type: promo.discount_type ?? 'percent',
      discount_value: promo.discount_value === null ? '' : String(promo.discount_value),
      min_order_amount: promo.min_order_amount === null ? '' : String(promo.min_order_amount),
      max_uses_per_user: promo.max_uses_per_user === null ? '' : String(promo.max_uses_per_user),
      starts_at: toDatetimeLocal(promo.starts_at),
      ends_at: toDatetimeLocal(promo.ends_at),
      productIds: linked,
      bundle_price: promo.bundle_price === null ? '' : String(promo.bundle_price),
      bogo_buy_product_id: promo.bogo_buy_product_id ?? '',
      bogo_buy_qty: String(promo.bogo_buy_qty),
      bogo_get_product_id: promo.bogo_get_product_id ?? '',
      bogo_get_qty: String(promo.bogo_get_qty),
      target_mode: promo.target_mode,
      target_percent: promo.target_percent === null ? '' : String(promo.target_percent),
      target_count: promo.target_count === null ? '' : String(promo.target_count),
      target_new_user_days: promo.target_new_user_days === null ? '30' : String(promo.target_new_user_days),
      targetMemberIds: targetMembers[promo.id] ?? [],
      is_active: promo.is_active,
    });
    setFormKind(kindOf(promo, linked.length));
    setProductSearch('');
    setMemberSearch('');
    setError(null);
    setFormOpen(true);
  };

  const toggleProductId = (id: string) => {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id) ? f.productIds.filter((p) => p !== id) : [...f.productIds, id],
    }));
  };

  const toggleMemberId = (id: string) => {
    setForm((f) => ({
      ...f,
      targetMemberIds: f.targetMemberIds.includes(id) ? f.targetMemberIds.filter((m) => m !== id) : [...f.targetMemberIds, id],
    }));
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Format gambar harus PNG, JPEG, WEBP, atau GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Ukuran gambar maksimal 5MB.');
      return;
    }

    setUploading(true);
    const compressed = await compressImage(file);
    const ext = compressed.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('promos').upload(path, compressed, {
      cacheControl: '31536000',
      upsert: false,
    });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('promos').getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // targeting validation + who ends up eligible (for 'specific'/'random')
    let targetMemberIds: string[] = [];
    if (form.target_mode === 'specific') {
      if (form.targetMemberIds.length === 0) {
        setError('Pilih minimal 1 member.');
        return;
      }
      targetMemberIds = form.targetMemberIds;
    } else if (form.target_mode === 'random') {
      const count = Number(form.target_count);
      if (!count || count < 1) {
        setError('Isi jumlah member acak.');
        return;
      }
      targetMemberIds = [...members]
        .sort(() => Math.random() - 0.5)
        .slice(0, count)
        .map((m) => m.id);
    } else if (form.target_mode === 'percent' && (!form.target_percent || Number(form.target_percent) < 1)) {
      setError('Isi persentase target (1-100).');
      return;
    } else if (form.target_mode === 'top_spenders' && (!form.target_count || Number(form.target_count) < 1)) {
      setError('Isi jumlah member teratas.');
      return;
    }

    let productIds: string[] = [];
    const base = {
      title: form.title,
      description: form.description || null,
      image_url: form.image_url || null,
      starts_at: form.starts_at === '' ? null : new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at === '' ? null : new Date(form.ends_at).toISOString(),
      max_uses_per_user: form.max_uses_per_user === '' ? null : Number(form.max_uses_per_user),
      target_mode: form.target_mode,
      target_percent: form.target_mode === 'percent' ? Number(form.target_percent) : null,
      target_count: form.target_mode === 'top_spenders' || form.target_mode === 'random' ? Number(form.target_count) : null,
      target_new_user_days: form.target_mode === 'new_users' ? Number(form.target_new_user_days || 30) : null,
      is_active: form.is_active,
    };

    let payload: Record<string, unknown>;

    if (formKind === 'bundle') {
      if (form.productIds.length < 2) {
        setError('Pilih minimal 2 produk untuk bundle.');
        return;
      }
      productIds = form.productIds;
      payload = {
        ...base,
        kind: 'bundle' as PromoKind,
        discount_type: null,
        discount_value: null,
        min_order_amount: null,
        bundle_price: Number(form.bundle_price),
        bogo_buy_product_id: null,
        bogo_get_product_id: null,
      };
    } else if (formKind === 'bogo') {
      if (!form.bogo_buy_product_id || !form.bogo_get_product_id) {
        setError('Pilih produk "Beli" dan "Gratis".');
        return;
      }
      productIds = [...new Set([form.bogo_buy_product_id, form.bogo_get_product_id])];
      payload = {
        ...base,
        kind: 'bogo' as PromoKind,
        discount_type: null,
        discount_value: null,
        min_order_amount: null,
        bundle_price: null,
        bogo_buy_product_id: form.bogo_buy_product_id,
        bogo_buy_qty: Number(form.bogo_buy_qty),
        bogo_get_product_id: form.bogo_get_product_id,
        bogo_get_qty: Number(form.bogo_get_qty),
      };
    } else {
      if ((formKind === 'item' || formKind === 'campaign') && form.productIds.length === 0) {
        setError('Pilih minimal 1 produk.');
        return;
      }
      productIds = formKind === 'checkout' ? [] : form.productIds;
      payload = {
        ...base,
        kind: 'discount' as PromoKind,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order_amount: formKind === 'checkout' ? (form.min_order_amount === '' ? null : Number(form.min_order_amount)) : null,
        bundle_price: null,
        bogo_buy_product_id: null,
        bogo_get_product_id: null,
      };
    }

    setSaving(true);
    const { data: savedPromo, error } = form.id
      ? await supabase.from('promos').update(payload).eq('id', form.id).select().single()
      : await supabase.from('promos').insert(payload).select().single();

    if (error || !savedPromo) {
      setSaving(false);
      setError(error?.message ?? 'Gagal menyimpan promo.');
      return;
    }

    const promoId = (savedPromo as Promo).id;
    await supabase.from('promo_products').delete().eq('promo_id', promoId);
    if (productIds.length > 0) {
      const { error: linkError } = await supabase
        .from('promo_products')
        .insert(productIds.map((product_id) => ({ promo_id: promoId, product_id })));
      if (linkError) {
        setSaving(false);
        setError(linkError.message);
        return;
      }
    }

    await supabase.from('promo_target_members').delete().eq('promo_id', promoId);
    if (targetMemberIds.length > 0) {
      const { error: targetError } = await supabase
        .from('promo_target_members')
        .insert(targetMemberIds.map((user_id) => ({ promo_id: promoId, user_id })));
      if (targetError) {
        setSaving(false);
        setError(targetError.message);
        return;
      }
    }

    setSaving(false);
    setFormOpen(false);
    setForm(emptyForm);
    await loadPromos();
  };

  const handleDelete = async (promo: Promo) => {
    if (!confirm(`Hapus promo "${promo.title}"?`)) return;
    const { error } = await supabase.from('promos').delete().eq('id', promo.id);
    if (error) {
      alert(`Tidak bisa dihapus: ${error.message}. Coba nonaktifkan saja.`);
      return;
    }
    await loadPromos();
  };

  const togglePromoActive = async (promo: Promo) => {
    await supabase.from('promos').update({ is_active: !promo.is_active }).eq('id', promo.id);
    await loadPromos();
  };

  const modalTitle =
    form.id
      ? 'Edit Promo'
      : { checkout: 'Kode Checkout Baru', item: 'Promo per Item Baru', campaign: 'Campaign Baru', bundle: 'Bundle Baru', bogo: 'Beli A Gratis B Baru' }[
          formKind
        ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Kelola Promo</h1>
          <p className="text-xs text-slate-500">Per item, campaign, bundle, beli-gratis, atau kode checkout.</p>
        </div>
        <button
          onClick={openPicker}
          className="flex shrink-0 items-center gap-1 rounded-full bg-brand-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-green-700"
        >
          <Icon name="Tag" size={14} />+ Tambah
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : promos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="Tag" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Belum ada promo. Tambah yang pertama.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {promos.map((promo) => {
            const productIds = linkedProducts[promo.id] ?? [];
            return (
              <div
                key={promo.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {promo.title} {!promo.is_active && <span className="text-xs text-slate-400">(nonaktif)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {promo.kind === 'bundle' && (
                      <>
                        📦 Bundle {productIds.length} produk ({productIds.slice(0, 2).map(productName).join(', ')}
                        {productIds.length > 2 && ` +${productIds.length - 2} lainnya`}) = {formatRupiah(promo.bundle_price ?? 0)}
                      </>
                    )}
                    {promo.kind === 'bogo' && (
                      <>
                        🎁 Beli {promo.bogo_buy_qty}× {productName(promo.bogo_buy_product_id)} → gratis {promo.bogo_get_qty}×{' '}
                        {productName(promo.bogo_get_product_id)}
                      </>
                    )}
                    {promo.kind === 'discount' && (
                      <>
                        {promo.discount_type === 'percent' ? `${promo.discount_value}%` : formatRupiah(promo.discount_value ?? 0)}
                        {productIds.length === 0 && (
                          <>
                            {' · kode checkout'}
                            {promo.min_order_amount !== null && ` · min. ${formatRupiah(promo.min_order_amount)}`}
                          </>
                        )}
                        {productIds.length === 1 && <> · diskon produk: {productName(productIds[0])}</>}
                        {productIds.length > 1 && (
                          <>
                            {' · campaign '}
                            {productIds.length} produk: {productIds.slice(0, 2).map(productName).join(', ')}
                            {productIds.length > 2 && ` +${productIds.length - 2} lainnya`}
                          </>
                        )}
                      </>
                    )}
                    {promo.max_uses_per_user !== null && ` · maks ${promo.max_uses_per_user}x/member`}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-brand-red">
                    {targetSummary(promo) && <span>{targetSummary(promo)}</span>}
                    {promo.ends_at && (
                      <span className="flex items-center gap-1">
                        <Icon name="History" size={12} />
                        <Countdown target={promo.ends_at} />
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => togglePromoActive(promo)}
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      promo.is_active ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {promo.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button onClick={() => startEdit(promo)} className="text-xs font-medium text-brand-green-700">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(promo)} className="text-xs font-medium text-red-500">
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={pickerOpen} title="Mau Buat Promo Apa?" onClose={() => setPickerOpen(false)}>
        <div className="flex flex-col gap-2">
          {KIND_PICKER.map((item) => (
            <button
              key={item.kind}
              onClick={() => chooseKind(item.kind)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-600">
                <Icon name={item.icon} size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={formOpen} title={modalTitle} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          {(formKind === 'item' || formKind === 'campaign') && (
            <div>
              <p className="text-sm font-medium text-slate-600">
                Berlaku untuk produk {formKind === 'campaign' && <span className="font-normal text-slate-400">(pilih 2+)</span>}
              </p>
              {products.length > 5 && (
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Cari produk..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
                />
              )}
              <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {filteredProducts.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-slate-400">{products.length === 0 ? 'Belum ada produk.' : 'Tidak ketemu.'}</p>
                ) : (
                  filteredProducts.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={form.productIds.includes(p.id)} onChange={() => toggleProductId(p.id)} />
                      {p.name}
                    </label>
                  ))
                )}
              </div>
              <span className="mt-1 block text-xs text-slate-400">
                Berlaku otomatis, tanpa kode. Isi "Berakhir" untuk menampilkan countdown di kartu produknya.
              </span>
            </div>
          )}

          {formKind === 'bundle' && (
            <div>
              <p className="text-sm font-medium text-slate-600">Produk dalam bundle (pilih 2+)</p>
              {products.length > 5 && (
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Cari produk..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
                />
              )}
              <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {filteredProducts.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-slate-400">{products.length === 0 ? 'Belum ada produk.' : 'Tidak ketemu.'}</p>
                ) : (
                  filteredProducts.map((p) => (
                    <label key={p.id} className="flex items-center justify-between gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={form.productIds.includes(p.id)} onChange={() => toggleProductId(p.id)} />
                        {p.name}
                      </span>
                      <span className="text-xs text-slate-400">{formatRupiah(p.price)}</span>
                    </label>
                  ))
                )}
              </div>
              {form.productIds.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Harga normal gabungan: {formatRupiah(form.productIds.reduce((sum, id) => sum + (products.find((p) => p.id === id)?.price ?? 0), 0))}
                </p>
              )}
            </div>
          )}

          {formKind === 'bogo' && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="w-2/3 text-sm text-slate-600">
                  Beli produk
                  <select
                    required
                    value={form.bogo_buy_product_id}
                    onChange={(e) => setForm({ ...form, bogo_buy_product_id: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
                  >
                    <option value="">Pilih produk</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-1/3 text-sm text-slate-600">
                  Jumlah
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.bogo_buy_qty}
                    onChange={(e) => setForm({ ...form, bogo_buy_qty: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <label className="w-2/3 text-sm text-slate-600">
                  Gratis produk
                  <select
                    required
                    value={form.bogo_get_product_id}
                    onChange={(e) => setForm({ ...form, bogo_get_product_id: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
                  >
                    <option value="">Pilih produk</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-1/3 text-sm text-slate-600">
                  Jumlah
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.bogo_get_qty}
                    onChange={(e) => setForm({ ...form, bogo_get_qty: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
                  />
                </label>
              </div>
              <span className="text-xs text-slate-400">Boleh pilih produk yang sama untuk pola "beli 2 gratis 1".</span>
            </div>
          )}

          <input
            required
            placeholder={formKind === 'checkout' ? 'Judul promo' : 'Nama promo (mis. Flash Sale Akhir Pekan)'}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
          />
          <textarea
            placeholder="Deskripsi (opsional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
          />

          {formKind !== 'item' && (
            <div className="flex items-center gap-3">
              {form.image_url && (
                <img src={form.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
              )}
              <label className="flex-1 text-sm text-slate-600">
                Gambar promo (opsional, maks 5MB)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="mt-1 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-green-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-green-700 hover:file:bg-brand-green-100"
                />
              </label>
            </div>
          )}
          {uploading && <p className="text-xs text-slate-400">Mengunggah gambar...</p>}

          {(formKind === 'checkout' || formKind === 'item' || formKind === 'campaign') && (
            <div className="flex gap-2">
              <select
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value as DiscountType })}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              >
                <option value="percent">Persen (%)</option>
                <option value="fixed">Potongan tetap (Rp)</option>
              </select>
              <input
                required
                type="number"
                min={1}
                placeholder={form.discount_type === 'percent' ? 'mis. 20' : 'mis. 10000'}
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            </div>
          )}

          {formKind === 'bundle' && (
            <input
              required
              type="number"
              min={0}
              placeholder="Harga bundle total (Rp)"
              value={form.bundle_price}
              onChange={(e) => setForm({ ...form, bundle_price: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
            />
          )}

          <div className="flex gap-2">
            {formKind === 'checkout' && (
              <input
                type="number"
                min={0}
                placeholder="Minimal belanja (opsional)"
                value={form.min_order_amount}
                onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            )}
            <input
              type="number"
              min={1}
              placeholder="Maks pemakaian/member (kosong = tak terbatas)"
              value={form.max_uses_per_user}
              onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value })}
              className={`${formKind === 'checkout' ? 'w-1/2' : 'w-full'} rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none`}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <label className="text-sm font-medium text-slate-600">
              Target member
              <select
                value={form.target_mode}
                onChange={(e) => setForm({ ...form, target_mode: e.target.value as PromoTargetMode })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              >
                {TARGET_MODE_OPTIONS.map((opt) => (
                  <option key={opt.mode} value={opt.mode}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {form.target_mode === 'percent' && (
              <input
                required
                type="number"
                min={1}
                max={100}
                placeholder="Persentase (1-100)"
                value={form.target_percent}
                onChange={(e) => setForm({ ...form, target_percent: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            )}

            {form.target_mode === 'top_spenders' && (
              <input
                required
                type="number"
                min={1}
                placeholder="Jumlah member teratas (mis. 20)"
                value={form.target_count}
                onChange={(e) => setForm({ ...form, target_count: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            )}

            {form.target_mode === 'new_users' && (
              <input
                type="number"
                min={1}
                placeholder="Member yang daftar dalam berapa hari terakhir (default 30)"
                value={form.target_new_user_days}
                onChange={(e) => setForm({ ...form, target_new_user_days: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            )}

            {form.target_mode === 'random' && (
              <input
                required
                type="number"
                min={1}
                placeholder="Jumlah member acak (dipilih ulang tiap simpan)"
                value={form.target_count}
                onChange={(e) => setForm({ ...form, target_count: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            )}

            {form.target_mode === 'specific' && (
              <div>
                {members.length > 5 && (
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Cari member..."
                    className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
                  />
                )}
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {filteredMembers.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-slate-400">{members.length === 0 ? 'Belum ada member.' : 'Tidak ketemu.'}</p>
                  ) : (
                    filteredMembers.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={form.targetMemberIds.includes(m.id)}
                          onChange={() => toggleMemberId(m.id)}
                        />
                        {m.name} <span className="font-mono text-xs text-slate-400">{m.member_code}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <label className="w-1/2 text-xs text-slate-500">
              Mulai (opsional)
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            </label>
            <label className="w-1/2 text-xs text-slate-500">
              Berakhir {formKind !== 'checkout' && '(untuk countdown)'}
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Aktif
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving || uploading}
            className="mt-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : form.id ? 'Simpan Perubahan' : 'Simpan Promo'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
