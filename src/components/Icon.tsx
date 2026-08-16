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
  Circle,
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
};

interface IconProps extends Omit<LucideProps, 'name'> {
  name?: string | null;
}

export default function Icon({ name, ...props }: IconProps) {
  const Cmp = (name && ICONS[name]) || Circle;
  return <Cmp {...props} />;
}
