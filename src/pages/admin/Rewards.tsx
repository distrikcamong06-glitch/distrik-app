import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Reward } from '../../types/database';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const emptyForm = {
  id: null as string | null,
  name: '',
  description: '',
  image_url: '',
  point_cost: '',
  stock: '',
  max_per_user: '',
  is_active: true,
};

export default function RewardsAdmin() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRewards = async () => {
    setLoading(true);
    const { data } = await supabase.from('rewards').select('*').order('created_at', { ascending: false });
    setRewards((data as Reward[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadRewards();
  }, []);

  const startEdit = (reward: Reward) => {
    setForm({
      id: reward.id,
      name: reward.name,
      description: reward.description ?? '',
      image_url: reward.image_url ?? '',
      point_cost: String(reward.point_cost),
      stock: reward.stock === null ? '' : String(reward.stock),
      max_per_user: reward.max_per_user === null ? '' : String(reward.max_per_user),
      is_active: reward.is_active,
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
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('rewards').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from('rewards').getPublicUrl(path);
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
      point_cost: Number(form.point_cost),
      stock: form.stock === '' ? null : Number(form.stock),
      max_per_user: form.max_per_user === '' ? null : Number(form.max_per_user),
      is_active: form.is_active,
    };

    const { error } = form.id
      ? await supabase.from('rewards').update(payload).eq('id', form.id)
      : await supabase.from('rewards').insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    await loadRewards();
  };

  const handleDelete = async (reward: Reward) => {
    if (!confirm(`Hapus reward "${reward.name}"?`)) return;
    const { error } = await supabase.from('rewards').delete().eq('id', reward.id);
    if (error) {
      if (error.message.includes('foreign key constraint')) {
        alert(
          `"${reward.name}" sudah pernah ditukar member, jadi tidak bisa dihapus permanen (supaya riwayat transaksi lama tidak rusak). Pakai tombol "Nonaktifkan" saja — reward akan hilang dari katalog tapi riwayatnya tetap aman.`
        );
      } else {
        alert(`Tidak bisa dihapus: ${error.message}`);
      }
      return;
    }
    await loadRewards();
  };

  const toggleRewardActive = async (reward: Reward) => {
    await supabase.from('rewards').update({ is_active: !reward.is_active }).eq('id', reward.id);
    await loadRewards();
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Kelola Reward</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-600">{form.id ? 'Edit reward' : 'Tambah reward baru'}</p>
        <input
          required
          placeholder="Nama reward"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <textarea
          placeholder="Deskripsi (opsional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          {form.image_url && (
            <img src={form.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
          )}
          <label className="flex-1 text-sm text-slate-600">
            Gambar reward (opsional, maks 5MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleImageUpload}
              disabled={uploading}
              className="mt-1 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </label>
        </div>
        {uploading && <p className="text-xs text-slate-400">Mengunggah gambar...</p>}
        <div className="flex gap-2">
          <input
            required
            type="number"
            min={1}
            placeholder="Harga poin"
            value={form.point_cost}
            onChange={(e) => setForm({ ...form, point_cost: e.target.value })}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <input
            type="number"
            min={0}
            placeholder="Stok (kosong = unlimited)"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <label className="text-sm text-slate-600">
          Batas penukaran per member (opsional)
          <input
            type="number"
            min={1}
            placeholder="Kosong = tidak dibatasi"
            value={form.max_per_user}
            onChange={(e) => setForm({ ...form, max_per_user: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Contoh: isi 1 supaya tiap member cuma boleh tukar reward ini sekali.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Aktif (tampil di katalog user)
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || uploading}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : form.id ? 'Simpan Perubahan' : 'Tambah Reward'}
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
          {rewards.map((reward) => (
            <div key={reward.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex min-w-0 items-center gap-3">
                {reward.image_url ? (
                  <img
                    src={reward.image_url}
                    alt={reward.name}
                    className="aspect-square h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex aspect-square h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-300">
                    Tanpa foto
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {reward.name} {!reward.is_active && <span className="text-xs text-slate-400">(nonaktif)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {reward.point_cost} poin · stok {reward.stock === null ? 'unlimited' : reward.stock}
                    {reward.max_per_user !== null && ` · maks ${reward.max_per_user}/member`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleRewardActive(reward)}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    reward.is_active ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {reward.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button onClick={() => startEdit(reward)} className="text-xs font-medium text-emerald-700">
                  Edit
                </button>
                <button onClick={() => handleDelete(reward)} className="text-xs font-medium text-red-500">
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
