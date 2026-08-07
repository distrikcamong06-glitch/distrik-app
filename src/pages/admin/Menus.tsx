import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Menu, MenuRole } from '../../types/database';
import Icon from '../../components/Icon';

const ICON_OPTIONS = [
  'User', 'QrCode', 'Gift', 'History', 'LayoutDashboard', 'ScanLine', 'Users', 'ClipboardList', 'Menu', 'Percent', 'Receipt',
];

const emptyForm = {
  id: null as string | null,
  label: '',
  path: '',
  icon: 'Circle',
  order: '0',
  role: 'all' as MenuRole,
  is_active: true,
};

export default function MenusAdmin() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMenus = async () => {
    setLoading(true);
    const { data } = await supabase.from('menus').select('*').order('role').order('order');
    setMenus((data as Menu[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadMenus();
  }, []);

  const startEdit = (menu: Menu) => {
    setForm({
      id: menu.id,
      label: menu.label,
      path: menu.path,
      icon: menu.icon ?? 'Circle',
      order: String(menu.order),
      role: menu.role,
      is_active: menu.is_active,
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      label: form.label,
      path: form.path,
      icon: form.icon,
      order: Number(form.order),
      role: form.role,
      is_active: form.is_active,
    };

    const { error } = form.id
      ? await supabase.from('menus').update(payload).eq('id', form.id)
      : await supabase.from('menus').insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    await loadMenus();
  };

  const handleDelete = async (menu: Menu) => {
    if (!confirm(`Hapus menu "${menu.label}"?`)) return;
    await supabase.from('menus').delete().eq('id', menu.id);
    await loadMenus();
  };

  const toggleActive = async (menu: Menu) => {
    await supabase.from('menus').update({ is_active: !menu.is_active }).eq('id', menu.id);
    await loadMenus();
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Kelola Menu</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-600">{form.id ? 'Edit menu' : 'Tambah menu baru'}</p>
        <input
          required
          placeholder="Label"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <input
          required
          placeholder="Path (mis. /rewards)"
          value={form.path}
          onChange={(e) => setForm({ ...form, path: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <select
            value={form.icon}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            {ICON_OPTIONS.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Urutan"
            value={form.order}
            onChange={(e) => setForm({ ...form, order: e.target.value })}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as MenuRole })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">Semua role</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
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
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : form.id ? 'Simpan Perubahan' : 'Tambah Menu'}
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
          {menus.map((menu) => (
            <div key={menu.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <Icon name={menu.icon} size={18} className="text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-800">{menu.label}</p>
                  <p className="text-xs text-slate-400">
                    {menu.path} · {menu.role} · urutan {menu.order}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(menu)}
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    menu.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {menu.is_active ? 'Aktif' : 'Nonaktif'}
                </button>
                <button onClick={() => startEdit(menu)} className="text-xs font-medium text-emerald-700">
                  Edit
                </button>
                <button onClick={() => handleDelete(menu)} className="text-xs font-medium text-red-500">
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
