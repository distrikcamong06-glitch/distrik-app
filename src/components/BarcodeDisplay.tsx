import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function BarcodeDisplay({ memberCode }: { memberCode: string }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <button
        onClick={() => setZoomed(true)}
        className="flex w-full flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md active:scale-[0.99]"
      >
        <QRCodeSVG value={memberCode} size={200} level="M" />
        <p className="font-mono text-base font-medium tracking-wide text-slate-700">{memberCode}</p>
        <p className="text-xs text-slate-400">Tunjukkan ke kasir · ketuk untuk perbesar</p>
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
