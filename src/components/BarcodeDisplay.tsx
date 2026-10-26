import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MemberCardBack } from './MemberCard';

export default function BarcodeDisplay({ memberCode }: { memberCode: string }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <button
        onClick={() => setZoomed(true)}
        aria-label="Lihat barcode member"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
      >
        <QRCodeSVG value={memberCode} size={40} level="M" />
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-brand-green-900 p-6"
          onClick={() => setZoomed(false)}
        >
          <div className="w-full max-w-sm">
            <MemberCardBack memberCode={memberCode} />
          </div>
          <p className="text-sm text-brand-green-50/80">Tunjukkan ini ke kasir · ketuk untuk tutup</p>
        </div>
      )}
    </>
  );
}
