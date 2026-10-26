import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { compressImage } from '../../lib/compressImage';
import { formatRupiah } from '../../lib/currency';
import type { Product } from '../../types/database';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const emptyForm = {
  id: null as string | null,
  name: '',
  description: '',
  image_url: '',
  price: '',
  stock: '',
  is_active: true,
};

export default function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const openAdd = () => {
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  };

  const startEdit = (product: Product) => {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description ?? '',
      image_url: product.image_url ?? '',
      price: String(product.price),
      stock: product.stock === null ? '' : String(product.stock),
      is_active: product.is_active,
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

    const { error: uploadError } = await supabase.storage.from('products').upload(path, compressed, {
      cacheControl: '31536000',
      upsert: false,
    });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('products').getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      description: form.description || null,
      image_url: form.image_url || null,
      price: Number(form.price),
      stock: form.stock === '' ? null : Number(form.stock),
      is_active: form.is_active,
    };

    const { error } = form.id
      ? await supabase.from('products').update(payload).eq('id', form.id)
      : await supabase.from('products').insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setFormOpen(false);
    setForm(emptyForm);
    await loadProducts();
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Hapus produk "${product.name}"?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) {
      if (error.message.includes('foreign key constraint')) {
        alert(
          `"${product.name}" sudah pernah dipesan member, jadi tidak bisa dihapus permanen (supaya riwayat pesanan lama tidak rusak). Pakai tombol "Nonaktifkan" saja.`
        );
      } else {
        alert(`Tidak bisa dihapus: ${error.message}`);
      }
      return;
    }
    await loadProducts();
  };

  const toggleProductActive = async (product: Product) => {
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
    await loadProducts();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-800">Kelola Produk</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 rounded-full bg-brand-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-green-700"
        >
          <Icon name="ShoppingBag" size={14} />+ Tambah
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="ShoppingBag" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Belum ada produk. Tambah yang pertama.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    className="aspect-square h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex aspect-square h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-300">
                    Tanpa foto
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {product.name} {!product.is_active && <span className="text-xs text-slate-400">(nonaktif)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatRupiah(product.price)} · stok {product.stock === null ? 'unlimited' : product.stock}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleProductActive(product)}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    product.is_active ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {product.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button onClick={() => startEdit(product)} className="text-xs font-medium text-brand-green-700">
                  Edit
                </button>
                <button onClick={() => handleDelete(product)} className="text-xs font-medium text-red-500">
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} title={form.id ? 'Edit Produk' : 'Tambah Produk Baru'} onClose={() => setFormOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            required
            placeholder="Nama produk"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
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
              Gambar produk (opsional, maks 5MB)
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
            <input
              required
              type="number"
              min={1}
              placeholder="Harga (Rp)"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
            />
            <input
              type="number"
              min={0}
              placeholder="Stok (kosong = unlimited)"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Aktif (tampil di katalog user)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving || uploading}
            className="mt-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : form.id ? 'Simpan Perubahan' : 'Tambah Produk'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
