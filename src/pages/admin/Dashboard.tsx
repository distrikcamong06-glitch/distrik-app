import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import Icon from '../../components/Icon';

interface Stats {
  memberCount: number;
  pointsOutstanding: number;
  transactionsToday: number;
  topReward: string | null;
}

const STAT_ICONS = ['Users', 'Star', 'Receipt', 'Gift'];

const SHORTCUT_SECTIONS: { title: string; items: { label: string; to: string; icon: string }[] }[] = [
  {
    title: 'Operasional',
    items: [
      { label: 'Penukaran', to: '/admin/redemptions', icon: 'ClipboardList' },
      { label: 'Pesanan', to: '/admin/orders', icon: 'PackageCheck' },
    ],
  },
  {
    title: 'Kelola Katalog',
    items: [
      { label: 'Reward', to: '/admin/rewards', icon: 'Gift' },
      { label: 'Produk', to: '/admin/products', icon: 'ShoppingBag' },
      { label: 'Promo', to: '/admin/promos', icon: 'Tag' },
      { label: 'Gambar & Promosi', to: '/admin/landing-content', icon: 'Images' },
      { label: 'Aturan Poin', to: '/admin/point-rules', icon: 'Percent' },
    ],
  },
  {
    title: 'Lainnya',
    items: [
      { label: 'Member', to: '/admin/members', icon: 'Users' },
      { label: 'Riwayat Transaksi', to: '/admin/transactions', icon: 'Receipt' },
    ],
  },
];

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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/admin/scan"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-brand-green-600 to-brand-green-700 py-7 text-white shadow-[0_4px_16px_rgba(31,92,52,0.35)] transition-transform active:scale-[0.98]"
        >
          <Icon name="ScanLine" size={30} />
          <span className="text-base font-semibold">Scan Poin</span>
        </Link>
        <Link
          to="/admin/scan-checkout"
          className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-brand-red to-brand-red-dark py-7 text-white shadow-[0_4px_16px_rgba(138,28,28,0.35)] transition-transform active:scale-[0.98]"
        >
          <Icon name="PackageCheck" size={30} />
          <span className="text-base font-semibold">Scan Checkout</span>
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-2">
          {cards.map((card, i) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <Icon name={STAT_ICONS[i]} size={13} className="text-brand-green-600" />
              <p className="mt-1 truncate text-[10px] leading-tight text-slate-400">{card.label}</p>
              <p className="truncate text-sm font-semibold text-slate-700">{card.value}</p>
            </div>
          ))}
        </div>

        {SHORTCUT_SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-slate-700">{section.title}</p>
            <div className="grid grid-cols-3 gap-3">
              {section.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(0,0,0,0.1)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-600">
                    <Icon name={item.icon} size={20} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
