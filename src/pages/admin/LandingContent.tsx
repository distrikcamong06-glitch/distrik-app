import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { compressImage } from '../../lib/compressImage';
import type { LandingItem, LandingSection } from '../../types/database';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const emptyForm = {
  id: null as string | null,
  section: 'promo' as LandingSection,
  title: '',
  description: '',
  image_url: '',
  link_url: '',
  order: '0',
  is_active: true,
};

export default function LandingContentAdmin() {
  const [items, setItems] = useState<LandingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('landing_items')
      .select('*')
      .order('section', { ascending: true })
      .order('order', { ascending: true });
    setItems((data as LandingItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  };

  const startEdit = (item: LandingItem) => {
    setForm({
      id: item.id,
      section: item.section,
      title: item.title ?? '',
      description: item.description ?? '',
      image_url: item.image_url,
      link_url: item.link_url ?? '',
      order: String(item.order),
      is_active: item.is_active,
    });
    setError(null);
    setFormOpen(true);
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

    const { error: uploadError } = await supabase.storage.from('landing').upload(path, compressed, {
      cacheControl: '31536000',
      upsert: false,
    });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('landing').getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.image_url) {
      setError('Upload gambar dulu.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      section: form.section,
      title: form.title || null,
      description: form.description || null,
      image_url: form.image_url,
      link_url: form.link_url || null,
      order: Number(form.order),
      is_active: form.is_active,
    };

    const { error } = form.id
      ? await supabase.from('landing_items').update(payload).eq('id', form.id)
      : await supabase.from('landing_items').insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setFormOpen(false);
    setForm(emptyForm);
    await loadItems();
  };

  const handleDelete = async (item: LandingItem) => {
    if (!confirm(`Hapus item ini dari landing page?`)) return;
    await supabase.from('landing_items').delete().eq('id', item.id);
    await loadItems();
  };

  const toggleItemActive = async (item: LandingItem) => {
    await supabase.from('landing_items').update({ is_active: !item.is_active }).eq('id', item.id);
    await loadItems();
  };

  const promoItems = items.filter((i) => i.section === 'promo');
  const galleryItems = items.filter((i) => i.section === 'gallery');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Gambar & Promosi Landing Page</h1>
          <p className="text-xs text-slate-500">Konten yang tampil di halaman depan (distrik-app.onrender.com).</p>
        </div>
        <button
          onClick={openAdd}
          className="flex shrink-0 items-center gap-1 rounded-full bg-brand-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-green-700"
        >
          <Icon name="Images" size={14} />+ Tambah
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : (
        <>
          <ItemList title="Promosi" items={promoItems} onEdit={startEdit} onDelete={handleDelete} onToggle={toggleItemActive} />
          <ItemList title="Galeri" items={galleryItems} onEdit={startEdit} onDelete={handleDelete} onToggle={toggleItemActive} />
        </>
      )}

      <Modal open={formOpen} title={form.id ? 'Edit Item' : 'Tambah Item Baru'} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="flex-1 text-sm text-slate-600">
              <input
                type="radio"
                name="section"
                checked={form.section === 'promo'}
                onChange={() => setForm({ ...form, section: 'promo' })}
              />{' '}
              Promosi
            </label>
            <label className="flex-1 text-sm text-slate-600">
              <input
                type="radio"
                name="section"
                checked={form.section === 'gallery'}
                onChange={() => setForm({ ...form, section: 'gallery' })}
              />{' '}
              Galeri
            </label>
          </div>

          <div className="flex items-center gap-3">
            {form.image_url && (
              <img
                src={form.image_url}
                alt=""
                className="aspect-square h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
            )}
            <label className="flex-1 text-sm text-slate-600">
              Gambar (wajib, maks 5MB)
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

          {form.section === 'promo' && (
            <>
              <input
                placeholder="Judul promo (opsional)"
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
              <input
                placeholder="Link tujuan kalau diklik (opsional)"
                value={form.link_url}
                onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            </>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">
              Urutan
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: e.target.value })}
                className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            </label>
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Aktif
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving || uploading}
            className="mt-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : form.id ? 'Simpan Perubahan' : 'Tambah Item'}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function ItemList({
  title,
  items,
  onEdit,
  onDelete,
  onToggle,
}: {
  title: string;
  items: LandingItem[];
  onEdit: (item: LandingItem) => void;
  onDelete: (item: LandingItem) => void;
  onToggle: (item: LandingItem) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-slate-600">
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Belum ada.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={item.image_url}
                  alt={item.title ?? ''}
                  loading="lazy"
                  className="aspect-square h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {item.title || <span className="text-slate-400">(tanpa judul)</span>}{' '}
                    {!item.is_active && <span className="text-xs text-slate-400">(nonaktif)</span>}
                  </p>
                  <p className="text-xs text-slate-400">Urutan {item.order}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => onToggle(item)}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    item.is_active ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button onClick={() => onEdit(item)} className="text-xs font-medium text-brand-green-700">
                  Edit
                </button>
                <button onClick={() => onDelete(item)} className="text-xs font-medium text-red-500">
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
