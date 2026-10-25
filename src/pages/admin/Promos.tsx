import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { compressImage } from '../../lib/compressImage';
import { formatRupiah } from '../../lib/currency';
import type { DiscountType, Promo } from '../../types/database';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const emptyForm = {
  id: null as string | null,
  title: '',
  description: '',
  image_url: '',
  discount_type: 'percent' as DiscountType,
  discount_value: '',
  min_order_amount: '',
  max_uses_per_user: '1',
  starts_at: '',
  ends_at: '',
  is_active: true,
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PromosAdmin() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPromos = async () => {
    setLoading(true);
    const { data } = await supabase.from('promos').select('*').order('created_at', { ascending: false });
    setPromos((data as Promo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadPromos();
  }, []);

  const startEdit = (promo: Promo) => {
    setForm({
      id: promo.id,
      title: promo.title,
      description: promo.description ?? '',
      image_url: promo.image_url ?? '',
      discount_type: promo.discount_type,
      discount_value: String(promo.discount_value),
      min_order_amount: promo.min_order_amount === null ? '' : String(promo.min_order_amount),
      max_uses_per_user: String(promo.max_uses_per_user),
      starts_at: toDatetimeLocal(promo.starts_at),
      ends_at: toDatetimeLocal(promo.ends_at),
      is_active: promo.is_active,
    });
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
    setSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description || null,
      image_url: form.image_url || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_amount: form.min_order_amount === '' ? null : Number(form.min_order_amount),
      max_uses_per_user: Number(form.max_uses_per_user),
      starts_at: form.starts_at === '' ? null : new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at === '' ? null : new Date(form.ends_at).toISOString(),
      is_active: form.is_active,
    };

    const { error } = form.id
      ? await supabase.from('promos').update(payload).eq('id', form.id)
      : await supabase.from('promos').insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Kelola Promo</h1>
        <p className="text-xs text-slate-500">
          Diskon yang bisa dipakai member sekali saat checkout produk di halaman Produk.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-600">{form.id ? 'Edit promo' : 'Tambah promo baru'}</p>
        <input
          required
          placeholder="Judul promo"
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
        {uploading && <p className="text-xs text-slate-400">Mengunggah gambar...</p>}

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

        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            placeholder="Minimal belanja (opsional)"
            value={form.min_order_amount}
            onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
          />
          <input
            required
            type="number"
            min={1}
            placeholder="Maks pemakaian/member"
            value={form.max_uses_per_user}
            onChange={(e) => setForm({ ...form, max_uses_per_user: e.target.value })}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
          />
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
            Berakhir (opsional)
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Aktif
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || uploading}
            className="flex-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : form.id ? 'Simpan Perubahan' : 'Tambah Promo'}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(emptyForm)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600"
            >
              Batal
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {promos.map((promo) => (
            <div key={promo.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">
                  {promo.title} {!promo.is_active && <span className="text-xs text-slate-400">(nonaktif)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {promo.discount_type === 'percent' ? `${promo.discount_value}%` : formatRupiah(promo.discount_value)}
                  {' · maks '}
                  {promo.max_uses_per_user}x/member
                  {promo.min_order_amount !== null && ` · min. ${formatRupiah(promo.min_order_amount)}`}
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
          ))}
        </div>
      )}
    </div>
  );
}
