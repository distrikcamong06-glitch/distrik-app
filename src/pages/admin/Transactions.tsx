import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { PointTransaction } from '../../types/database';

export default function Transactions() {
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from('point_transactions')
      .select('*, profiles!point_transactions_user_id_fkey(name, member_code)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      query = query.lte('created_at', end.toISOString());
    }

    const { data } = await query;
    setTransactions((data as PointTransaction[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    const header = ['Tanggal', 'Member', 'Kode Member', 'Tipe', 'Poin', 'Nominal Belanja', 'Deskripsi'];
    const rows = transactions.map((tx) => [
      new Date(tx.created_at).toISOString(),
      tx.profiles?.name ?? '',
      tx.profiles?.member_code ?? '',
      tx.type,
      String(tx.points),
      tx.amount_spent === null ? '' : String(tx.amount_spent),
      tx.description ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transaksi-poin-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Riwayat & Laporan</h1>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-xs text-slate-500">
          Dari
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Sampai
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button onClick={load} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
          Filter
        </button>
        <button
          onClick={exportCsv}
          disabled={transactions.length === 0}
          className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada transaksi pada rentang ini.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Tipe</th>
                <th className="px-3 py-2">Poin</th>
                <th className="px-3 py-2">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {new Date(tx.created_at).toLocaleString('id-ID')}
                  </td>
                  <td className="px-3 py-2">
                    {tx.profiles?.name}
                    <span className="block font-mono text-xs text-slate-400">{tx.profiles?.member_code}</span>
                  </td>
                  <td className="px-3 py-2 capitalize text-slate-600">{tx.type}</td>
                  <td className={`px-3 py-2 font-medium ${tx.points >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.points >= 0 ? '+' : ''}
                    {tx.points}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {tx.amount_spent ? `Rp${tx.amount_spent.toLocaleString('id-ID')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
