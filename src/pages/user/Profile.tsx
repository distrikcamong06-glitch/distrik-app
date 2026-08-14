import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import ShareWhatsAppButton from '../../components/ShareWhatsAppButton';

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Profil</h1>
        <p className="text-sm text-slate-500">{session.user.email}</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <label className="text-sm font-medium text-slate-600">
          Nama
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          No. HP
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          Kode member
          <input
            disabled
            value={profile.member_code}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
          />
        </label>
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>

        {profile.role === 'user' && (
          <ShareWhatsAppButton
            message={`Halo! Ini profil member Distrik Camong aku:\nNama: ${profile.name}\nKode member: ${profile.member_code}\nPoin: ${profile.points_balance} poin`}
            label="Bagikan Profil"
          />
        )}
      </form>

      <form
        onSubmit={handlePasswordChange}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <p className="text-sm font-medium text-slate-600">Ganti Password</p>
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password baru"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        {pwMessage && <p className="text-sm text-slate-500">{pwMessage}</p>}
        <button
          type="submit"
          disabled={pwSaving}
          className="rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {pwSaving ? 'Menyimpan...' : 'Ganti Password'}
        </button>
      </form>
    </div>
  );
}
