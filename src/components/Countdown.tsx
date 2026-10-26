import { useEffect, useState } from 'react';

function format(ms: number): string {
  if (ms <= 0) return 'Berakhir';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}h ${hours}j lagi`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function Countdown({ target, onExpire }: { target: string; onExpire?: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = new Date(target).getTime() - now;

  useEffect(() => {
    if (remaining <= 0) onExpire?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0]);

  return <>{format(remaining)}</>;
}
