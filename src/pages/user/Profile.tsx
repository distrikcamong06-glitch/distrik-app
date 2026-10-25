import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icon';

const MENU_LINKS = [
  { label: 'Riwayat Poin', to: '/points-history', icon: 'Receipt' },
  { label: 'Riwayat Penukaran', to: '/rewards/history', icon: 'History' },
  { label: 'Riwayat Pesanan', to: '/orders/history', icon: 'PackageCheck' },
];

export default function Profile() {
  const { profile, session, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  if (!profile || !session) return null;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    const { error } = await supabase.from('profiles').update({ name, phone }).eq('id', profile.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage('Profil berhasil diperbarui.');
    await refreshProfile();
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwSaving(true);
    setPwMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    setPwMessage(error ? error.message : 'Password berhasil diganti.');
    if (!error) setNewPassword('');
  };

  const initial = profile.name?.trim()?.[0]?.toUpperCase() ?? '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-green-600 to-brand-green-700 p-5 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -right-2 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{profile.name}</h1>
            <p className="truncate text-xs text-brand-green-50/80">{session.user.email}</p>
          </div>
        </div>
        <div className="relative mt-4 border-t border-white/15 pt-3">
          <p className="text-xs text-brand-green-50/80">Saldo Poin</p>
          <p className="text-2xl font-semibold tracking-tight">{profile.points_balance}</p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {MENU_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Icon name={item.icon} size={18} className="text-slate-400" />
            <span className="flex-1">{item.label}</span>
            <Icon name="ChevronRight" size={16} className="text-slate-300" />
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
        >
          <Icon name="LogOut" size={18} />
          <span className="flex-1">Keluar</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <p className="text-sm font-semibold text-slate-700">Data Diri</p>
        <label className="text-sm font-medium text-slate-600">
          Nama
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors focus:border-brand-green-500 focus:outline-none focus:ring-2 focus:ring-brand-green-100"
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          No. HP
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors focus:border-brand-green-500 focus:outline-none focus:ring-2 focus:ring-brand-green-100"
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          Kode member
          <input
            disabled
            value={profile.member_code}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-400"
          />
        </label>
        {message && <p className="text-sm text-brand-green-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-700 disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </form>

      <form
        onSubmit={handlePasswordChange}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Icon name="Lock" size={15} className="text-slate-400" />
          Ganti Password
        </p>
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password baru"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors focus:border-brand-green-500 focus:outline-none focus:ring-2 focus:ring-brand-green-100"
        />
        {pwMessage && <p className="text-sm text-slate-500">{pwMessage}</p>}
        <button
          type="submit"
          disabled={pwSaving}
          className="rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {pwSaving ? 'Menyimpan...' : 'Ganti Password'}
        </button>
      </form>
    </div>
  );
}
