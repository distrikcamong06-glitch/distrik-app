import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import QrCode from './QrCode';

const ROTATE_MS = 2 * 60 * 1000;

const RPC_BY_KIND = {
  redemption: { fn: 'refresh_redemption_token', arg: 'p_redemption_id' },
  order: { fn: 'refresh_order_token', arg: 'p_order_id' },
} as const;

export default function RotatingQr({
  id,
  kind = 'redemption',
  initialToken,
  size = 140,
}: {
  id: string;
  kind?: keyof typeof RPC_BY_KIND;
  initialToken: string;
  size?: number;
}) {
  const [token, setToken] = useState(initialToken);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(initialToken);
    setSecondsLeft(120);
    setError(null);

    const { fn, arg } = RPC_BY_KIND[kind];

    const refresh = async () => {
      const { data, error } = await supabase.rpc(fn, { [arg]: id });
      if (error) {
        setError(error.message);
        return;
      }
      if (data?.rotating_token) {
        setToken(data.rotating_token);
        setSecondsLeft(120);
        setError(null);
      }
    };

    // Always refresh right away too — the token we were handed could
    // already be stale (e.g. reopening this page more than 2 minutes
    // after it was first issued).
    refresh();

    const rotateInterval = setInterval(refresh, ROTATE_MS);
    const tickInterval = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);

    return () => {
      clearInterval(rotateInterval);
      clearInterval(tickInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  return (
    <div className="flex shrink-0 flex-col items-center gap-1" style={{ width: Math.max(size, 112) }}>
      <QrCode value={token} size={size} />
      <p className="font-mono text-xs font-medium tracking-wider text-slate-700">{token}</p>
      {error ? (
        <p className="max-w-[220px] text-center text-[11px] text-red-500">{error}</p>
      ) : (
        <p className="text-center text-[10px] leading-snug text-slate-400">
          Susah discan? Ketik kode di atas — berubah dalam {secondsLeft}s
        </p>
      )}
    </div>
  );
}
