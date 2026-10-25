import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../types/database';

export default function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: Role;
}) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
        Memuat...
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!profile.is_active) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center px-4">
        <p className="text-red-600">
          Akun kamu dinonaktifkan. Hubungi admin Distrik Camong untuk informasi lebih lanjut.
        </p>
      </div>
    );
  }

  if (role && profile.role !== role) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/home'} replace />;
  }

  return <>{children}</>;
}
