import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Login from './pages/Login';
import Register from './pages/Register';

import Barcode from './pages/user/Barcode';
import Profile from './pages/user/Profile';
import Rewards from './pages/user/Rewards';
import RedemptionHistory from './pages/user/RedemptionHistory';

import Dashboard from './pages/admin/Dashboard';
import Scan from './pages/admin/Scan';
import Members from './pages/admin/Members';
import RewardsAdmin from './pages/admin/Rewards';
import MenusAdmin from './pages/admin/Menus';
import PointRulesAdmin from './pages/admin/PointRules';
import Transactions from './pages/admin/Transactions';
import RedemptionsAdmin from './pages/admin/Redemptions';

function Home() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin' : '/barcode'} replace />;
}

function withLayout(node: ReactNode) {
  return <Layout>{node}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/" element={<Home />} />

          {/* User */}
          <Route
            path="/barcode"
            element={<ProtectedRoute role="user">{withLayout(<Barcode />)}</ProtectedRoute>}
          />
          <Route path="/profile" element={<ProtectedRoute>{withLayout(<Profile />)}</ProtectedRoute>} />
          <Route
            path="/rewards"
            element={<ProtectedRoute role="user">{withLayout(<Rewards />)}</ProtectedRoute>}
          />
          <Route
            path="/rewards/history"
            element={<ProtectedRoute role="user">{withLayout(<RedemptionHistory />)}</ProtectedRoute>}
          />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute role="admin">{withLayout(<Dashboard />)}</ProtectedRoute>} />
          <Route
            path="/admin/scan"
            element={<ProtectedRoute role="admin">{withLayout(<Scan />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/members"
            element={<ProtectedRoute role="admin">{withLayout(<Members />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/rewards"
            element={<ProtectedRoute role="admin">{withLayout(<RewardsAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/menus"
            element={<ProtectedRoute role="admin">{withLayout(<MenusAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/point-rules"
            element={<ProtectedRoute role="admin">{withLayout(<PointRulesAdmin />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/transactions"
            element={<ProtectedRoute role="admin">{withLayout(<Transactions />)}</ProtectedRoute>}
          />
          <Route
            path="/admin/redemptions"
            element={<ProtectedRoute role="admin">{withLayout(<RedemptionsAdmin />)}</ProtectedRoute>}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
