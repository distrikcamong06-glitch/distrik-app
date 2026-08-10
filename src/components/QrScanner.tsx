import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const ELEMENT_ID = 'qr-scanner-region';

export default function QrScanner({
  onScan,
  placeholder = 'Atau scan/ketik kode member (CMG-...)',
}: {
  onScan: (code: string) => void;
  placeholder?: string;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        (decodedText) => onScan(decodedText.trim()),
        () => {
          // per-frame decode miss, ignore
        }
      )
      .catch(() => {
        setCameraError('Kamera tidak tersedia. Gunakan input manual atau scanner fisik di bawah.');
      });

    return () => {
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div id={ELEMENT_ID} className="mx-auto w-full max-w-sm overflow-hidden rounded-xl" />
      {cameraError && <p className="text-center text-sm text-amber-600">{cameraError}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manualCode.trim()) {
            onScan(manualCode.trim());
            setManualCode('');
          }
        }}
      >
        <input
          autoFocus
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Cari
        </button>
      </form>
      <p className="text-xs text-slate-400">
        Scanner barcode fisik bekerja seperti keyboard — cukup fokuskan kursor di kotak ini lalu scan.
      </p>
    </div>
  );
}
