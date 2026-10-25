import {
  User,
  QrCode,
  Gift,
  History,
  LayoutDashboard,
  ScanLine,
  Users,
  ClipboardList,
  Menu as MenuIcon,
  Percent,
  Receipt,
  LogOut,
  Images,
  Megaphone,
  ShoppingBag,
  Tag,
  PackageCheck,
  Circle,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  PackageOpen,
  Lock,
  Search,
  Star,
  Home as HomeIcon,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  User,
  QrCode,
  Gift,
  History,
  LayoutDashboard,
  ScanLine,
  Users,
  ClipboardList,
  Menu: MenuIcon,
  Percent,
  Receipt,
  LogOut,
  Images,
  Megaphone,
  ShoppingBag,
  Tag,
  PackageCheck,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  PackageOpen,
  Lock,
  Search,
  Star,
  Home: HomeIcon,
};

interface IconProps extends Omit<LucideProps, 'name'> {
  name?: string | null;
}

export default function Icon({ name, ...props }: IconProps) {
  const Cmp = (name && ICONS[name]) || Circle;
  return <Cmp {...props} />;
}
