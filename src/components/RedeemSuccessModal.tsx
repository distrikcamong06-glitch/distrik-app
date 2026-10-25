import { CheckCircle2, X } from 'lucide-react';
import Confetti from './Confetti';
import RotatingQr from './RotatingQr';

export default function RedeemSuccessModal({
  rewardName,
  redemptionId,
  redeemCode,
  rotatingToken,
  onClose,
}: {
  rewardName: string;
  redemptionId: string;
  redeemCode: string;
  rotatingToken: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="animate-success-in relative flex w-full max-w-sm flex-col items-center gap-4 overflow-hidden rounded-2xl bg-white p-6 text-center shadow-xl">
        <Confetti />

        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 text-slate-400 hover:text-slate-600"
          aria-label="Tutup"
        >
          <X size={20} />
        </button>

        <div className="relative flex items-center justify-center">
          <span className="animate-glow-pulse absolute h-16 w-16 rounded-full bg-brand-green-400" />
          <CheckCircle2 size={64} strokeWidth={1.5} className="animate-success-pop relative text-brand-green-500" />
        </div>

        <div>
          <p className="text-lg font-semibold text-slate-800">Penukaran Berhasil!</p>
          <p className="text-sm text-slate-500">{rewardName}</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <RotatingQr id={redemptionId} kind="redemption" initialToken={rotatingToken} size={160} />
        </div>
        <p className="font-mono text-xs tracking-wide text-slate-400">Ref: {redeemCode}</p>
        <p className="text-xs text-slate-400">
          Tunjukkan QR ini ke kasir untuk ambil reward. Berlaku 24 jam, lalu otomatis hangus dan poin dikembalikan.
        </p>

        <button
          onClick={onClose}
          className="mt-1 w-full rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}
