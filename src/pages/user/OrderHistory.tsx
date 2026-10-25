import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatRupiah } from '../../lib/currency';
import type { Order } from '../../types/database';
import RotatingQr from '../../components/RotatingQr';

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Menunggu diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const STATUS_STYLE: Record<Order['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-brand-green-50 text-brand-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function OrderHistory() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOrders((data as Order[]) ?? []);
        setLoading(false);
      });
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Riwayat Pesanan</h1>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada pesanan.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-3">
                {o.status === 'pending' && (
                  <RotatingQr id={o.id} kind="order" initialToken={o.rotating_token ?? o.order_code} size={48} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-600">
                    {o.order_items?.map((i) => `${i.quantity}× ${i.product_name}`).join(', ')}
                  </p>
                  <p className="font-mono text-xs text-slate-400">Ref: {o.order_code}</p>
                  <p className="text-xs text-slate-400">{new Date(o.created_at).toLocaleString('id-ID')}</p>
                  {o.status === 'pending' && o.expires_at && (
                    <p className="text-xs text-amber-600">Berlaku sampai {new Date(o.expires_at).toLocaleString('id-ID')}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-700">{formatRupiah(o.total)}</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
