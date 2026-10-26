import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Redemption } from '../../types/database';
import RotatingQr from '../../components/RotatingQr';
import Icon from '../../components/Icon';

const STATUS_LABEL: Record<Redemption['status'], string> = {
  pending: 'Menunggu diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const STATUS_STYLE: Record<Redemption['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-brand-green-50 text-brand-green-700',
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
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="PackageOpen" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Belum ada penukaran.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {redemptions.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{r.rewards?.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">Ref: {r.redeem_code}</p>
                  <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString('id-ID')}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </div>

              {r.status === 'pending' && (
                <div className="flex items-center gap-3 rounded-xl bg-amber-50/60 p-3">
                  <RotatingQr initialToken={r.redeem_code} size={48} />
                  {r.expires_at && (
                    <p className="text-xs text-amber-700">
                      Berlaku sampai<br />
                      <span className="font-medium">{new Date(r.expires_at).toLocaleString('id-ID')}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">Poin digunakan</span>
                <span className="text-sm font-semibold text-slate-800">{r.points_used} poin</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
