import { useMemo } from 'react';

const COLORS = ['#8a1c1c', '#1f5c34', '#f4c430', '#ffffff', '#2f7d4e'];

export default function Confetti({ count = 50 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1.6 + Math.random() * 1.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotate: Math.random() * 360,
        width: 5 + Math.random() * 6,
        drift: (Math.random() - 0.5) * 60,
      })),
    [count]
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="animate-confetti-fall absolute top-0 rounded-[1px]"
          style={
            {
              left: `${p.left}%`,
              width: p.width,
              height: p.width * 0.4,
              backgroundColor: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--confetti-rotate': `${p.rotate + 720}deg`,
              '--confetti-drift': `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
