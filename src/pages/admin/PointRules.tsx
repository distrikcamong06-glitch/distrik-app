import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { PointRules } from '../../types/database';

export default function PointRulesAdmin() {
  const [rules, setRules] = useState<PointRules | null>(null);
  const [rupiahPerPoint, setRupiahPerPoint] = useState('');
  const [signupBonus, setSignupBonus] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('point_rules')
      .select('*')
      .limit(1)
      .single()
      .then(({ data }) => {
        const r = data as PointRules;
        setRules(r);
        setRupiahPerPoint(String(r.rupiah_per_point));
        setSignupBonus(String(r.signup_bonus));
        setExpiryDays(r.points_expiry_days === null ? '' : String(r.points_expiry_days));
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rules) return;
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('point_rules')
      .update({
        rupiah_per_point: Number(rupiahPerPoint),
        signup_bonus: Number(signupBonus),
        points_expiry_days: expiryDays === '' ? null : Number(expiryDays),
        updated_at: new Date().toISOString(),
      })
      .eq('id', rules.id);

    setSaving(false);
    setMessage(error ? error.message : 'Aturan poin berhasil diperbarui.');
  };

  if (!rules) return <p className="text-sm text-slate-400">Memuat...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Aturan Poin</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-medium text-slate-600">
          Rasio konversi (Rp per 1 poin)
          <input
            type="number"
            required
            min={1}
            value={rupiahPerPoint}
            onChange={(e) => setRupiahPerPoint(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">Contoh: 1000 artinya belanja Rp1.000 = 1 poin.</p>
        </label>

        <label className="text-sm font-medium text-slate-600">
          Bonus poin registrasi
          <input
            type="number"
            required
            min={0}
            value={signupBonus}
            onChange={(e) => setSignupBonus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="text-sm font-medium text-slate-600">
          Kadaluarsa poin (hari, kosongkan = tidak kadaluarsa)
          <input
            type="number"
            min={1}
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {message && <p className="text-sm text-emerald-600">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? 'Menyimpan...' : 'Simpan Aturan'}
        </button>
      </form>
    </div>
  );
}
