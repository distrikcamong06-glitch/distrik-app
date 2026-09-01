import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// Best-effort deterrents against casually saving/copying the code — browsers
// don't expose any real way to block an actual screen-capture, so this is
// just friction, not real protection. The rotating token (see RotatingQr) is
// what actually makes a screenshot useless after a couple of minutes.
const noCopyProps = {
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as React.CSSProperties,
};

export default function QrCode({ value, size = 140 }: { value: string; size?: number }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setZoomed(true)} className="inline-block" {...noCopyProps}>
        <QRCodeSVG value={value} size={size} level="M" />
      </button>

      {zoomed && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-white p-6"
          onClick={() => setZoomed(false)}
          {...noCopyProps}
        >
          <QRCodeSVG value={value} size={260} level="M" />
          <p className="font-mono text-lg tracking-wide text-slate-700">{value}</p>
          <p className="text-sm text-slate-400">Ketuk untuk tutup</p>
        </div>
      )}
    </>
  );
}
