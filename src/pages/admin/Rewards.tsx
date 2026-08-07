import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Reward } from '../../types/database';

const emptyForm = {
  id: null as string | null,
  name: '',
  description: '',
  image_url: '',
  point_cost: '',
  stock: '',
  is_active: true,
};

export default function RewardsAdmin() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
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
      is_active: reward.is_active,
    });
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
      alert(`Tidak bisa dihapus (${error.message}). Coba nonaktifkan saja.`);
      return;
    }
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
        <input
          placeholder="URL gambar (opsional)"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
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
            disabled={saving}
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
              <div>
                <p className="font-medium text-slate-800">
                  {reward.name} {!reward.is_active && <span className="text-xs text-slate-400">(nonaktif)</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {reward.point_cost} poin · stok {reward.stock === null ? 'unlimited' : reward.stock}
                </p>
              </div>
              <div className="flex gap-2">
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
