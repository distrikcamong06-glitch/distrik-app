import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Icon from './Icon';

const USER_MENU = [
  { label: 'Beranda', path: '/home', icon: 'Home' },
  { label: 'Produk', path: '/products', icon: 'ShoppingBag' },
  { label: 'Reward', path: '/rewards', icon: 'Gift' },
  { label: 'Barcode', path: '/barcode', icon: 'QrCode' },
  { label: 'Profil', path: '/profile', icon: 'User' },
];

const ADMIN_MENU = [
  { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
  { label: 'Scan Poin', path: '/admin/scan', icon: 'ScanLine' },
  { label: 'Member', path: '/admin/members', icon: 'Users' },
  { label: 'Penukaran', path: '/admin/redemptions', icon: 'ClipboardList' },
  { label: 'Reward', path: '/admin/rewards', icon: 'Gift' },
  { label: 'Produk', path: '/admin/products', icon: 'ShoppingBag' },
  { label: 'Promo', path: '/admin/promos', icon: 'Tag' },
  { label: 'Pesanan', path: '/admin/orders', icon: 'PackageCheck' },
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
    <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-1.5 shadow-[0_-2px_8px_rgba(15,23,42,0.04)] sm:justify-center">
      {menu.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          className={({ isActive }) =>
            `flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] transition-colors ${
              isActive
                ? 'bg-brand-green-50 font-semibold text-brand-green-700'
                : 'font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600'
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
