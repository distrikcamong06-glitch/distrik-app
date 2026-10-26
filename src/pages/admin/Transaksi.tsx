import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';

const ITEMS = [
  { label: 'Penukaran', description: 'Konfirmasi pengambilan reward', to: '/admin/redemptions', icon: 'ClipboardList' },
  { label: 'Pesanan', description: 'Konfirmasi pengambilan produk', to: '/admin/orders', icon: 'PackageCheck' },
  { label: 'Member', description: 'Cari, kelola poin & akun member', to: '/admin/members', icon: 'Users' },
  { label: 'Riwayat Transaksi', description: 'Semua mutasi poin', to: '/admin/transactions', icon: 'Receipt' },
];

export default function Transaksi() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Transaksi</h1>

      <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-600">
              <Icon name={item.icon} size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{item.label}</p>
              <p className="truncate text-xs text-slate-400">{item.description}</p>
            </div>
            <Icon name="ChevronRight" size={16} className="shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}
