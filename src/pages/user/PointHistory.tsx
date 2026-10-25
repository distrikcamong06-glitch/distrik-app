import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icon';
import type { PointTransaction, TransactionType } from '../../types/database';

const TYPE_LABEL: Record<TransactionType, string> = {
  earn: 'Belanja di toko',
  redeem: 'Tukar reward',
  adjust: 'Penyesuaian',
};

export default function PointHistory() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTransactions((data as PointTransaction[]) ?? []);
        setLoading(false);
      });
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Riwayat Poin</h1>
        <p className="text-sm text-slate-500">Saldo saat ini: {profile.points_balance} poin</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="PackageOpen" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Belum ada riwayat poin.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {transactions.map((tx) => {
            const positive = tx.points >= 0;
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    positive ? 'bg-brand-green-50 text-brand-green-600' : 'bg-red-50 text-red-500'
                  }`}
                >
                  <Icon name={positive ? 'ArrowUpRight' : 'ArrowDownRight'} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{tx.description ?? TYPE_LABEL[tx.type]}</p>
                  <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString('id-ID')}</p>
                  {tx.amount_spent !== null && (
                    <p className="text-xs text-slate-400">Belanja Rp{tx.amount_spent.toLocaleString('id-ID')}</p>
                  )}
                </div>
                <p className={`shrink-0 text-sm font-semibold ${positive ? 'text-brand-green-600' : 'text-red-500'}`}>
                  {positive ? '+' : ''}
                  {tx.points} poin
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
