import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import type { Menu } from '../types/database';
import Icon from './Icon';

export default function NavMenu() {
  const { profile } = useAuth();
  const [menus, setMenus] = useState<Menu[]>([]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    supabase
      .from('menus')
      .select('*')
      .in('role', [profile.role, 'all'])
      .eq('is_active', true)
      .is('parent_id', null)
      .order('order', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setMenus((data as Menu[]) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (!profile) return null;

  return (
    <nav className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-2 py-1.5 sm:justify-center">
      {menus.map((menu) => (
        <NavLink
          key={menu.id}
          to={menu.path}
          end
          className={({ isActive }) =>
            `flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'
            }`
          }
        >
          <Icon name={menu.icon} size={20} strokeWidth={2} />
          <span className="whitespace-nowrap">{menu.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
