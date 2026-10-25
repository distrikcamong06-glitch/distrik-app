import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icon';

export default function Profile() {
  const { profile, session, refreshProfile } = useAuth();
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-green-100 text-lg font-semibold text-brand-green-700">
          {initial}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-800">{profile.name}</h1>
          <p className="truncate text-sm text-slate-500">{session.user.email}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
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
