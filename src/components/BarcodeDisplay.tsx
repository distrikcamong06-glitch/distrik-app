import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function BarcodeDisplay({ memberCode }: { memberCode: string }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <button
        onClick={() => setZoomed(true)}
        className="relative flex w-full flex-col items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-green-600 to-brand-green-700 p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)] active:scale-[0.99]"
      >
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative rounded-2xl bg-white p-4">
          <QRCodeSVG value={memberCode} size={200} level="M" />
        </div>
        <p className="relative font-mono text-base font-medium tracking-wide text-white">{memberCode}</p>
        <p className="relative text-xs text-brand-green-50/80">Tunjukkan ke kasir · ketuk untuk perbesar</p>
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6"
          onClick={() => setZoomed(false)}
        >
          <QRCodeSVG value={memberCode} size={280} level="M" />
          <p className="font-mono text-lg tracking-wide text-slate-700">{memberCode}</p>
          <p className="text-sm text-slate-400">Tunjukkan ini ke kasir · ketuk untuk tutup</p>
        </div>
      )}
    </>
  );
}
