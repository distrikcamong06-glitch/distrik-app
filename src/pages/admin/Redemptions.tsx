import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { Redemption, RedemptionStatus } from '../../types/database';
import QrScanner from '../../components/QrScanner';
import Icon from '../../components/Icon';

const STATUS_LABEL: Record<RedemptionStatus, string> = {
  pending: 'Menunggu diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export default function RedemptionsAdmin() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RedemptionStatus | 'all'>('pending');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from('redemptions')
      .select('*, rewards(name, image_url), profiles(name, member_code)')
      .order('created_at', { ascending: false });
    if (filter !== 'all') query = query.eq('status', filter);
    const { data } = await query;
    setRedemptions((data as Redemption[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const lookupCode = async (rawCode: string) => {
    setMessage(null);
    // Strip anything that isn't part of our generated codes so this can't
    // break PostgREST's .or() filter syntax.
    const safeCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!safeCode) return;

    const { data } = await supabase
      .from('redemptions')
      .select('*, rewards(name, image_url), profiles(name, member_code)')
      .or(`redeem_code.eq.${safeCode},rotating_token.eq.${safeCode}`)
      .maybeSingle();

    if (!data) {
      setMessage('Kode penukaran tidak ditemukan. Kalau ini dari scan QR, minta member buka lagi halamannya — kodenya berubah tiap 2 menit.');
      return;
    }

    const row = data as Redemption;
    if (
      row.status === 'pending' &&
      row.rotating_token === safeCode &&
      row.rotating_token_expires_at &&
      new Date(row.rotating_token_expires_at) < new Date()
    ) {
      setMessage('Kode QR ini sudah kedaluwarsa (berubah tiap 2 menit) — minta member buka lagi halaman penukarannya untuk dapat kode baru.');
      return;
    }

    setRedemptions([row]);
    setFilter('all');
  };

  const findByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookupCode(code);
  };

  const handleScan = async (scannedCode: string) => {
    setScanning(false);
    setCode(scannedCode);
    await lookupCode(scannedCode);
  };

  const confirm = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    const { error } = await supabase.rpc('confirm_redemption', { p_redemption_id: id });
    setBusyId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Batalkan penukaran ini? Poin akan dikembalikan ke member.')) return;
    setBusyId(id);
    setMessage(null);
    const { error } = await supabase.rpc('cancel_redemption', { p_redemption_id: id });
    setBusyId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Konfirmasi Penukaran</h1>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          className="flex items-center justify-center gap-2 rounded-lg border border-brand-green-200 bg-brand-green-50 py-2 text-sm font-medium text-brand-green-700"
        >
          <Icon name="ScanLine" size={16} />
          {scanning ? 'Tutup Scanner' : 'Scan Barcode Penukaran'}
        </button>

        {scanning && <QrScanner onScan={handleScan} />}

        <form onSubmit={findByCode} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Atau ketik kode penukaran..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-brand-green-600 px-4 py-2 text-sm text-white">
            Cari
          </button>
        </form>
      </div>

      <div className="flex gap-2">
        {(['pending', 'completed', 'cancelled', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === s ? 'bg-brand-green-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s === 'all' ? 'Semua' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : redemptions.length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada penukaran.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {redemptions.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="font-medium text-slate-800">{r.rewards?.name}</p>
                <p className="text-xs text-slate-500">
                  {r.profiles?.name} · {r.profiles?.member_code}
                </p>
                <p className="font-mono text-xs text-slate-400">{r.redeem_code}</p>
                {r.status === 'pending' && r.expires_at && (
                  <p className="text-xs text-amber-600">
                    Berlaku sampai {new Date(r.expires_at).toLocaleString('id-ID')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{STATUS_LABEL[r.status]}</span>
                {r.status === 'pending' && (
                  <>
                    <button
                      onClick={() => confirm(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-lg bg-brand-green-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                    >
                      Konfirmasi
                    </button>
                    <button
                      onClick={() => cancel(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
                    >
                      Batalkan
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
