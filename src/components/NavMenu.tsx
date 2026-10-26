import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Icon from './Icon';

const USER_MENU = [
  { label: 'Beranda', path: '/home', icon: 'Home' },
  { label: 'Produk', path: '/products', icon: 'ShoppingBag' },
  { label: 'Reward', path: '/rewards', icon: 'Gift' },
  { label: 'Profil', path: '/profile', icon: 'User' },
];

const ADMIN_MENU = [
  { label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard' },
  { label: 'Scan Poin', path: '/admin/scan', icon: 'ScanLine' },
  { label: 'Kelola', path: '/admin/kelola', icon: 'Layers' },
  { label: 'Transaksi', path: '/admin/transaksi', icon: 'Receipt' },
];

export default function NavMenu() {
  const { profile } = useAuth();
  if (!profile) return null;

  const menu = profile.role === 'admin' ? ADMIN_MENU : USER_MENU;

  return (
    <nav className="flex border-t border-slate-200 bg-white px-2 py-1.5 shadow-[0_-2px_8px_rgba(15,23,42,0.04)] sm:justify-center">
      {menu.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end
          className={({ isActive }) =>
            `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] transition-colors sm:flex-none sm:px-3 ${
              isActive
                ? 'bg-brand-green-50 font-semibold text-brand-green-700'
                : 'font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            }`
          }
        >
          <Icon name={item.icon} size={20} strokeWidth={2} />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
