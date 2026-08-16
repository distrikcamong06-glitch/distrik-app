import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
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
        <p className="text-sm text-slate-400">Belum ada riwayat poin.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{tx.description ?? TYPE_LABEL[tx.type]}</p>
                <p className="text-xs text-slate-400">{new Date(tx.created_at).toLocaleString('id-ID')}</p>
                {tx.amount_spent !== null && (
                  <p className="text-xs text-slate-400">Belanja Rp{tx.amount_spent.toLocaleString('id-ID')}</p>
                )}
              </div>
              <p className={`text-sm font-semibold ${tx.points >= 0 ? 'text-brand-green-600' : 'text-red-500'}`}>
                {tx.points >= 0 ? '+' : ''}
                {tx.points} poin
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
