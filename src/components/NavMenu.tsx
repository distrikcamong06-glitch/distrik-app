import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Icon from './Icon';

const USER_MENU = [
  { label: 'Barcode Saya', path: '/barcode', icon: 'QrCode' },
  { label: 'Tukar Poin', path: '/rewards', icon: 'Gift' },
  { label: 'Riwayat Penukaran', path: '/rewards/history', icon: 'History' },
  { label: 'Riwayat Poin', path: '/points-history', icon: 'Receipt' },
  { label: 'Profil', path: '/profile', icon: 'User' },
];

const ADMIN_MENU = [
  { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
  { label: 'Scan Poin', path: '/admin/scan', icon: 'ScanLine' },
  { label: 'Member', path: '/admin/members', icon: 'Users' },
  { label: 'Penukaran', path: '/admin/redemptions', icon: 'ClipboardList' },
  { label: 'Reward', path: '/admin/rewards', icon: 'Gift' },
  { label: 'Gambar & Promosi', path: '/admin/landing-content', icon: 'Images' },
  { label: 'Aturan Poin', path: '/admin/point-rules', icon: 'Percent' },
  { label: 'Riwayat Transaksi', path: '/admin/transactions', icon: 'Receipt' },
  { label: 'Profil', path: '/profile', icon: 'User' },
];

export default function NavMenu() {
  const { profile } = useAuth();
  if (!profile) return null;

  const menu = profile.role === 'admin' ? ADMIN_MENU : USER_MENU;

  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-1.5 sm:justify-center">
      {menu.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          className={({ isActive }) =>
            `flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'
            }`
          }
        >
          <Icon name={item.icon} size={20} strokeWidth={2} />
          <span className="whitespace-nowrap">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
