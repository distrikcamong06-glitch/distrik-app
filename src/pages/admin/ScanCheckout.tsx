import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatRupiah } from '../../lib/currency';
import type { Order, Redemption } from '../../types/database';
import QrScanner from '../../components/QrScanner';
import Icon from '../../components/Icon';

type Matched = { kind: 'redemption'; row: Redemption } | { kind: 'order'; row: Order } | null;

const REDEMPTION_SELECT = '*, rewards(name, image_url), profiles(name, member_code)';
const ORDER_SELECT = '*, order_items(*), promos(title), profiles(name, member_code)';

export default function ScanCheckout() {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(true);
  const [matched, setMatched] = useState<Matched>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const lookupCode = async (rawCode: string) => {
    setMessage(null);
    setMatched(null);
    const safeCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!safeCode) return;

    const [{ data: redemptionRow, error: redemptionError }, { data: orderRow, error: orderError }] = await Promise.all([
      supabase
        .from('redemptions')
        .select(REDEMPTION_SELECT)
        .or(`redeem_code.eq.${safeCode},rotating_token.eq.${safeCode}`)
        .maybeSingle(),
      supabase
        .from('orders')
        .select(ORDER_SELECT)
        .or(`order_code.eq.${safeCode},rotating_token.eq.${safeCode}`)
        .maybeSingle(),
    ]);

    if (redemptionError || orderError) {
      setMessage(`Gagal mencari: ${redemptionError?.message ?? orderError?.message}`);
      return;
    }

    if (redemptionRow) {
      setMatched({ kind: 'redemption', row: redemptionRow as Redemption });
      setScanning(false);
      return;
    }
    if (orderRow) {
      setMatched({ kind: 'order', row: orderRow as Order });
      setScanning(false);
      return;
    }

    setMessage('Kode tidak ditemukan — bukan kode penukaran reward maupun pesanan produk. Mungkin sudah lebih dari 2 jam dan otomatis hangus.');
  };

  const findByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await lookupCode(code);
  };

  const handleScan = async (scannedCode: string) => {
    setCode(scannedCode);
    await lookupCode(scannedCode);
  };

  const reset = () => {
    setMatched(null);
    setMessage(null);
    setCode('');
    setScanning(true);
  };

  const confirm = async () => {
    if (!matched) return;
    setBusy(true);
    setMessage(null);
    const { error } =
      matched.kind === 'redemption'
        ? await supabase.rpc('confirm_redemption', { p_redemption_id: matched.row.id })
        : await supabase.rpc('confirm_order', { p_order_id: matched.row.id });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    reset();
    setMessage('Berhasil dikonfirmasi.');
  };

  const cancel = async () => {
    if (!matched) return;
    const confirmText =
      matched.kind === 'redemption' ? 'Batalkan penukaran ini? Poin akan dikembalikan ke member.' : 'Batalkan pesanan ini? Stok produk akan dikembalikan.';
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage(null);
    const { error } =
      matched.kind === 'redemption'
        ? await supabase.rpc('cancel_redemption', { p_redemption_id: matched.row.id })
        : await supabase.rpc('cancel_order', { p_order_id: matched.row.id });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    reset();
    setMessage('Dibatalkan.');
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Scan Checkout</h1>
        <p className="text-sm text-slate-500">Scan satu kode untuk penukaran reward maupun pesanan produk — sistem otomatis deteksi.</p>
      </div>

      {!matched && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => setScanning((s) => !s)}
            className="flex items-center justify-center gap-2 rounded-lg border border-brand-green-200 bg-brand-green-50 py-2 text-sm font-medium text-brand-green-700"
          >
            <Icon name="ScanLine" size={16} />
            {scanning ? 'Tutup Scanner' : 'Buka Scanner'}
          </button>

          {scanning && <QrScanner onScan={handleScan} />}

          <form onSubmit={findByCode} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Atau ketik kode penukaran/pesanan..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
            />
            <button type="submit" className="rounded-lg bg-brand-green-600 px-4 py-2 text-sm text-white">
              Cari
            </button>
          </form>
        </div>
      )}

      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${matched ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
          {message}
        </p>
      )}

      {matched?.kind === 'redemption' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2">
            <Icon name="Gift" size={16} className="text-brand-green-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green-700">Penukaran Reward</p>
          </div>
          <div>
            <p className="font-medium text-slate-800">{matched.row.rewards?.name}</p>
            <p className="text-xs text-slate-500">
              {matched.row.profiles?.name} · {matched.row.profiles?.member_code}
            </p>
            <p className="font-mono text-xs text-slate-400">{matched.row.redeem_code}</p>
            <p className="text-sm font-semibold text-slate-700">{matched.row.points_used} poin</p>
            {matched.row.status === 'pending' && matched.row.expires_at && (
              <p className="text-xs text-amber-600">Berlaku sampai {new Date(matched.row.expires_at).toLocaleString('id-ID')}</p>
            )}
          </div>
          {matched.row.status === 'pending' ? (
            <div className="flex gap-2">
              <button
                onClick={confirm}
                disabled={busy}
                className="flex-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Memproses...' : 'Konfirmasi Diambil'}
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
              >
                Batalkan
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Status: {matched.row.status === 'completed' ? 'Selesai' : 'Dibatalkan'}</p>
          )}
          <button onClick={reset} className="text-sm text-slate-500 underline">
            Scan lagi
          </button>
        </div>
      )}

      {matched?.kind === 'order' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2">
            <Icon name="PackageCheck" size={16} className="text-brand-green-600" />
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green-700">Pesanan Produk</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">
              {matched.row.profiles?.name} · {matched.row.profiles?.member_code}
            </p>
            <p className="font-mono text-xs text-slate-400">{matched.row.order_code}</p>
            {matched.row.status === 'pending' && matched.row.expires_at && (
              <p className="text-xs text-amber-600">Berlaku sampai {new Date(matched.row.expires_at).toLocaleString('id-ID')}</p>
            )}
          </div>

          <ul className="flex flex-col gap-0.5 rounded-lg bg-slate-50 p-2">
            {matched.row.order_items?.map((item) => (
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
              <span>{formatRupiah(matched.row.subtotal)}</span>
            </div>
            {matched.row.discount_amount > 0 && (
              <div className="flex justify-between text-brand-green-700">
                <span>Diskon{matched.row.promos?.title ? ` (${matched.row.promos.title})` : ''}</span>
                <span>-{formatRupiah(matched.row.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold text-slate-800">
              <span>Total bayar di kasir</span>
              <span>{formatRupiah(matched.row.total)}</span>
            </div>
          </div>

          {matched.row.status === 'pending' ? (
            <div className="flex gap-2">
              <button
                onClick={confirm}
                disabled={busy}
                className="flex-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Memproses...' : 'Konfirmasi (sudah dibayar)'}
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
              >
                Batalkan
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Status: {matched.row.status === 'completed' ? 'Selesai' : 'Dibatalkan'}</p>
          )}
          <button onClick={reset} className="text-sm text-slate-500 underline">
            Scan lagi
          </button>
        </div>
      )}
    </div>
  );
}
