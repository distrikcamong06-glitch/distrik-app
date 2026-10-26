import QrCode from './QrCode';

export default function RotatingQr({
  initialToken,
  size = 140,
}: {
  initialToken: string;
  size?: number;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1" style={{ width: Math.max(size, 112) }}>
      <QrCode value={initialToken} size={size} />
      <p className="font-mono text-sm font-semibold tracking-wider text-slate-700">{initialToken}</p>
    </div>
  );
}
