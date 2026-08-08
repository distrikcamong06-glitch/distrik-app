import { CheckCircle2, X } from 'lucide-react';
import QrCode from './QrCode';

export default function RedeemSuccessModal({
  rewardName,
  redeemCode,
  onClose,
}: {
  rewardName: string;
  redeemCode: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="animate-success-in relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
          aria-label="Tutup"
        >
          <X size={20} />
        </button>

        <CheckCircle2 size={64} strokeWidth={1.5} className="animate-success-pop text-emerald-500" />

        <div>
          <p className="text-lg font-semibold text-slate-800">Penukaran Berhasil!</p>
          <p className="text-sm text-slate-500">{rewardName}</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <QrCode value={redeemCode} size={160} />
        </div>
        <p className="font-mono text-sm tracking-wide text-slate-700">{redeemCode}</p>
        <p className="text-xs text-slate-400">Tunjukkan kode/barcode ini ke kasir untuk ambil reward</p>

        <button
          onClick={onClose}
          className="mt-1 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}
