import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatRupiah } from '../../lib/currency';
import type { Order, OrderStatus } from '../../types/database';
import QrScanner from '../../components/QrScanner';
import Icon from '../../components/Icon';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Menunggu diambil',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const SELECT = '*, order_items(*), promos(title), profiles(name, member_code)';

export default function OrdersAdmin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('pending');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase.from('orders').select(SELECT).order('created_at', { ascending: false });
    if (filter !== 'all') query = query.eq('status', filter);
    const { data } = await query;
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const lookupCode = async (rawCode: string) => {
    setMessage(null);
    const safeCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!safeCode) return;

    const { data, error } = await supabase
      .from('orders')
      .select(SELECT)
      .or(`order_code.eq.${safeCode},rotating_token.eq.${safeCode}`)
      .maybeSingle();

    if (error) {
      setMessage(`Gagal mencari: ${error.message}`);
      return;
    }
    if (!data) {
      setMessage('Kode pesanan tidak ditemukan. Mungkin sudah lebih dari 2 jam dan otomatis hangus.');
      return;
    }

    const row = data as Order;
    if (
      row.status === 'pending' &&
      row.rotating_token === safeCode &&
      row.rotating_token_expires_at &&
      new Date(row.rotating_token_expires_at) < new Date()
    ) {
      setMessage('Kode QR ini sudah kedaluwarsa.');
      return;
    }

    setOrders([row]);
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
    const { error } = await supabase.rpc('confirm_order', { p_order_id: id });
    setBusyId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Batalkan pesanan ini? Stok produk akan dikembalikan.')) return;
    setBusyId(id);
    setMessage(null);
    const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
    setBusyId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Konfirmasi Pesanan</h1>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setScanning((s) => !s)}
          className="flex items-center justify-center gap-2 rounded-lg border border-brand-green-200 bg-brand-green-50 py-2 text-sm font-medium text-brand-green-700"
        >
          <Icon name="ScanLine" size={16} />
          {scanning ? 'Tutup Scanner' : 'Scan Barcode Pesanan'}
        </button>

        {scanning && <QrScanner onScan={handleScan} />}

        <form onSubmit={findByCode} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Atau ketik kode pesanan..."
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
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada pesanan.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <div key={o.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {o.profiles?.name} · {o.profiles?.member_code}
                  </p>
                  <p className="font-mono text-xs text-slate-400">{o.order_code}</p>
                  {o.status === 'pending' && o.expires_at && (
                    <p className="text-xs text-amber-600">Berlaku sampai {new Date(o.expires_at).toLocaleString('id-ID')}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-slate-500">{STATUS_LABEL[o.status]}</span>
              </div>

              <ul className="flex flex-col gap-0.5 rounded-lg bg-slate-50 p-2">
                {o.order_items?.map((item) => (
                  <li key={item.id} className="flex justify-between text-xs text-slate-600">
                    <span>
                      {item.quantity}× {item.product_name}
                    </span>
                    <span>{formatRupiah(item.subtotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-0.5 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatRupiah(o.subtotal)}</span>
                </div>
                {o.discount_amount > 0 && (
                  <div className="flex justify-between text-brand-green-700">
                    <span>Diskon{o.promos?.title ? ` (${o.promos.title})` : ''}</span>
                    <span>-{formatRupiah(o.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-slate-800">
                  <span>Total bayar di kasir</span>
                  <span>{formatRupiah(o.total)}</span>
                </div>
              </div>

              {o.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => confirm(o.id)}
                    disabled={busyId === o.id}
                    className="flex-1 rounded-lg bg-brand-green-600 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Konfirmasi (sudah dibayar)
                  </button>
                  <button
                    onClick={() => cancel(o.id)}
                    disabled={busyId === o.id}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50"
                  >
                    Batalkan
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
