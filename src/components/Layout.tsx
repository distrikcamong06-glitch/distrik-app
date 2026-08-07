import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import NavMenu from './NavMenu';
import Icon from './Icon';

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Distrik Camong</p>
          {profile && (
            <p className="text-xs text-slate-500">
              {profile.name} · {profile.role === 'admin' ? 'Admin' : `${profile.points_balance} poin`}
            </p>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          <Icon name="LogOut" size={16} />
          Keluar
        </button>
      </header>

      <main className="flex-1 px-4 py-5 pb-4">
        <div className="mx-auto w-full max-w-2xl">{children}</div>
      </main>

      <div className="sticky bottom-0">
        <NavMenu />
      </div>
    </div>
  );
}
