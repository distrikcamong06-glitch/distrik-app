import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Redemption } from '../../types/database';

const STATUS_LABEL: Record<Redemption['status'], string> = {
  pending: 'Menunggu diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const STATUS_STYLE: Record<Redemption['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function RedemptionHistory() {
  const { profile } = useAuth();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('redemptions')
      .select('*, rewards(name, image_url)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRedemptions((data as Redemption[]) ?? []);
        setLoading(false);
      });
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Riwayat Penukaran</h1>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : redemptions.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada penukaran.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {redemptions.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{r.rewards?.name}</p>
                <p className="font-mono text-xs text-slate-400">{r.redeem_code}</p>
                <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString('id-ID')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-700">{r.points_used} poin</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
