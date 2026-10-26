import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NavMenu from './NavMenu';
import Icon from './Icon';
import PromoPopup from './PromoPopup';
import logo from '../assets/logo.png';

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initial = profile?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {profile?.role === 'user' && <PromoPopup userId={profile.id} />}

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur print:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={logo} alt="Distrik Camong" className="h-8 w-auto shrink-0" />
          {profile && (
            <Link
              to="/profile"
              className="flex min-w-0 items-center gap-2 rounded-lg border-l border-slate-200 py-1 pl-2.5 pr-2 transition-colors hover:bg-slate-50"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-green-100 text-xs font-semibold text-brand-green-700">
                {initial}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium text-slate-800">{profile.name}</p>
                <p className="text-[11px] text-slate-400">
                  {profile.role === 'admin' ? 'Admin' : `${profile.points_balance} poin`}
                </p>
              </div>
            </Link>
          )}
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Keluar"
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="LogOut" size={16} />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </header>

      <main className="flex-1 px-4 py-5 pb-6">
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </main>

      <div className="sticky bottom-0 z-20 print:hidden">
        <NavMenu />
      </div>
    </div>
  );
}
