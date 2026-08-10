import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import QrScanner from '../../components/QrScanner';
import type { Profile } from '../../types/database';

export default function Scan() {
  const [member, setMember] = useState<Profile | null>(null);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleScan = async (rawInput: string) => {
    setResult(null);
    setLookupError(null);
    setMember(null);
    setSearchResults([]);

    const trimmed = rawInput.trim();
    if (!trimmed) return;

    const { data: byCode } = await supabase
      .from('profiles')
      .select('*')
      .eq('member_code', trimmed.toUpperCase())
      .maybeSingle();

    if (byCode) {
      setMember(byCode as Profile);
      return;
    }

    // Not a member code — try matching by phone number instead, in case
    // the member doesn't have their QR handy.
    const { data: byPhone } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'user')
      .ilike('phone', `%${trimmed}%`)
      .limit(10);

    if (byPhone && byPhone.length === 1) {
      setMember(byPhone[0] as Profile);
      return;
    }
    if (byPhone && byPhone.length > 1) {
      setSearchResults(byPhone as Profile[]);
      return;
    }

    setLookupError('Member dengan kode atau nomor HP tersebut tidak ditemukan.');
  };

  const handleAddPoints = async (e: FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setSubmitting(true);
    setResult(null);

    const { data, error } = await supabase.rpc('admin_add_points', {
      p_member_code: member.member_code,
      p_amount_spent: Number(amount),
    });

    setSubmitting(false);

    if (error) {
      setResult({ type: 'error', text: error.message });
      return;
    }

    setResult({ type: 'success', text: `+${data.points} poin ditambahkan untuk ${member.name}.` });
    setMember({ ...member, points_balance: member.points_balance + data.points });
    setAmount('');
  };

  const reset = () => {
    setMember(null);
    setSearchResults([]);
    setResult(null);
    setLookupError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Scan Poin</h1>

      {!member && (
        <QrScanner onScan={handleScan} placeholder="Atau ketik kode member / nomor HP..." />
      )}
      {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}

      {searchResults.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-500">
            Ditemukan {searchResults.length} member dengan nomor HP itu — pilih salah satu:
          </p>
          {searchResults.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMember(m);
                setSearchResults([]);
              }}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span>
                <span className="block font-medium text-slate-800">{m.name}</span>
                <span className="block text-xs text-slate-400">
                  {m.phone} · {m.member_code}
                </span>
              </span>
              <span className="text-xs font-medium text-emerald-700">{m.points_balance} poin</span>
            </button>
          ))}
        </div>
      )}

      {member && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800">{member.name}</p>
              <p className="font-mono text-xs text-slate-400">{member.member_code}</p>
              {member.phone && <p className="text-xs text-slate-400">{member.phone}</p>}
            </div>
            <p className="text-sm font-semibold text-emerald-700">{member.points_balance} poin</p>
          </div>

          <form onSubmit={handleAddPoints} className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600">
              Nominal belanja (Rp)
              <input
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Memproses...' : 'Tambah Poin'}
            </button>
          </form>

          {result && (
            <p className={`text-sm ${result.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {result.text}
            </p>
          )}

          <button onClick={reset} className="text-sm text-slate-500 underline">
            Scan member lain
          </button>
        </div>
      )}
    </div>
  );
}
