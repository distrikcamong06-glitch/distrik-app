import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface Stats {
  memberCount: number;
  pointsOutstanding: number;
  transactionsToday: number;
  topReward: string | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ count: memberCount }, { data: profilesData }, { count: transactionsToday }, { data: redemptionData }] =
        await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
          supabase.from('profiles').select('points_balance').eq('role', 'user'),
          supabase
            .from('point_transactions')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString()),
          supabase.from('redemptions').select('reward_id, rewards(name)'),
        ]);

      const pointsOutstanding = (profilesData ?? []).reduce((sum, p) => sum + (p.points_balance ?? 0), 0);

      const counts = new Map<string, { name: string; count: number }>();
      for (const row of redemptionData ?? []) {
        const r = row as unknown as { reward_id: string; rewards: { name: string } | null };
        const key = r.reward_id;
        const existing = counts.get(key);
        counts.set(key, { name: r.rewards?.name ?? '—', count: (existing?.count ?? 0) + 1 });
      }
      let topReward: string | null = null;
      let max = 0;
      for (const { name, count } of counts.values()) {
        if (count > max) {
          max = count;
          topReward = name;
        }
      }

      setStats({
        memberCount: memberCount ?? 0,
        pointsOutstanding,
        transactionsToday: transactionsToday ?? 0,
        topReward,
      });
    };
    load();
  }, []);

  const cards = [
    { label: 'Total Member', value: stats?.memberCount ?? '—' },
    { label: 'Poin Beredar', value: stats?.pointsOutstanding ?? '—' },
    { label: 'Transaksi Hari Ini', value: stats?.transactionsToday ?? '—' },
    { label: 'Reward Terpopuler', value: stats?.topReward ?? 'Belum ada' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Dashboard Admin</h1>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{card.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
